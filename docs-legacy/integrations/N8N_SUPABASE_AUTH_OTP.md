# Fluxentiq: Supabase Auth → n8n Cloud → Gmail OTP delivery

This workflow sends the **Supabase-generated OTP** through an
n8n Cloud Gmail node. It does not generate a new random verification code.
Supabase validates the code when Fluxentiq calls `supabase.auth.verifyOtp()`.

> **Important — Send Email Hook is enabled:** Supabase bypasses everything in
> **Authentication → Email Templates** while this hook is active. The branded
> Fluxentiq email must therefore be built in n8n, not in the Supabase Confirm
> Signup template. Use the complete production Code node source in
> [`fluxentiq-n8n-send-email-hook-code.js`](./fluxentiq-n8n-send-email-hook-code.js).
> It verifies the signed Supabase event and produces the dark Fluxentiq OTP
> email for signup, recovery, magic-link, invitation, and email-change actions.

## Security model

```text
Fluxentiq signup / resend
  → Supabase Auth generates token + signed Send Email Hook request
  → n8n Cloud production webhook verifies the signature
  → Gmail sends Supabase's configured verification token to the recipient
  → Fluxentiq verifies that exact token with Supabase Auth
```

Never use a locally generated random code for this flow. A code generated in
n8n is not stored by Supabase and cannot verify a Supabase account.

## n8n workflow layout

```text
Webhook (POST /Email; Raw Body enabled; Respond = Using "Respond to Webhook" node)
  → Code (verify Supabase signature + prepare email payload)
  → Gmail (send)
  → Respond to Webhook (Respond With = JSON; HTTP 200; body = {})
```

### Required JSON acknowledgement

Supabase Auth rejects an HTML webhook acknowledgement. In the **Webhook** node,
set **Respond** to **Using "Respond to Webhook" node**. In the final
**Respond to Webhook** node, set:

```text
Respond With: JSON
Response Body: {}
Response Code: 200
```

Do **not** select `Text` and do not use the Webhook node's `Immediately`
response mode. Either option returns `text/html`, which causes this Supabase
error:

```text
Invalid JSON response. Received content-type: text/html; charset=utf-8
```

Use the **production** webhook URL in Supabase:

```text
https://hrmanagerfluxentiqai.app.n8n.cloud/webhook/Email
```

Do not use `/webhook-test/Email` for the Supabase Hook.

## Required n8n configuration

1. In the **Webhook** node:
   - HTTP Method: `POST`
   - Path: `Email`
   - Enable **Raw Body**
   - Response: use a `Respond to Webhook` node
2. In n8n, create a protected Variable named:

   ```text
   SUPABASE_AUTH_EMAIL_HOOK_SECRET
   ```

   Paste the exact secret generated in Supabase Auth Hooks. Do not commit it,
   paste it into Fluxentiq, or store it in a Code node.
3. Configure the Gmail node with a Gmail OAuth2 credential inside n8n.
4. Activate the n8n workflow. Only an active workflow receives calls on the
   `/webhook/Email` production URL.

## Code node script

Set the Code node to **Run Once for All Items** and paste this script.

```javascript
const crypto = require('crypto')

const item = $input.first()
const headers = Object.fromEntries(
  Object.entries(item.json.headers ?? {}).map(([key, value]) => [
    key.toLowerCase(),
    Array.isArray(value) ? value[0] : String(value),
  ]),
)

function readRawBody() {
  if (typeof item.json.rawBody === 'string') return item.json.rawBody
  if (typeof item.json.body === 'string') return item.json.body

  for (const binaryKey of ['data', 'body', 'rawBody']) {
    const binary = item.binary?.[binaryKey]
    if (binary?.data) return Buffer.from(binary.data, 'base64').toString('utf8')
  }

  throw new Error('Raw Body is unavailable. Enable Raw Body in the Webhook node before signature verification.')
}

function secretBytes(secret) {
  const normalized = secret
    .trim()
    .replace(/^v1,/, '')
    .replace(/^whsec_/, '')
  return Buffer.from(normalized, 'base64')
}

function signatures(header) {
  return header
    .split(' ')
    .map(value => value.trim())
    .filter(value => value.startsWith('v1,'))
    .map(value => value.slice(3))
}

const hookSecret = $vars.SUPABASE_AUTH_EMAIL_HOOK_SECRET
if (!hookSecret) throw new Error('Missing n8n variable SUPABASE_AUTH_EMAIL_HOOK_SECRET.')

const webhookId = headers['webhook-id']
const webhookTimestamp = headers['webhook-timestamp']
const webhookSignature = headers['webhook-signature']
if (!webhookId || !webhookTimestamp || !webhookSignature) {
  throw new Error('Missing Supabase Standard Webhooks signature headers.')
}

const timestamp = Number(webhookTimestamp)
if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
  throw new Error('Supabase webhook timestamp is outside the five-minute verification window.')
}

const rawBody = readRawBody()
const expected = crypto
  .createHmac('sha256', secretBytes(hookSecret))
  .update(`${webhookId}.${webhookTimestamp}.${rawBody}`)
  .digest('base64')

const valid = signatures(webhookSignature).some(signature => {
  const supplied = Buffer.from(signature)
  const calculated = Buffer.from(expected)
  return supplied.length === calculated.length && crypto.timingSafeEqual(supplied, calculated)
})
if (!valid) throw new Error('Invalid Supabase Send Email Hook signature.')

const event = JSON.parse(rawBody)
const emailData = event.email_data ?? {}
const recipient = event.user?.email
const otp = String(emailData.token ?? '')
const action = String(emailData.email_action_type ?? '')

if (!recipient) throw new Error('Supabase hook did not include a recipient email.')
if (!/^\d{6,10}$/.test(otp)) throw new Error('Supabase hook did not include a valid numeric OTP.')

const subjectByAction = {
  signup: 'Verify your Fluxentiq email',
  recovery: 'Your Fluxentiq password recovery code',
  magiclink: 'Your Fluxentiq sign-in code',
  invite: 'Your Fluxentiq invitation code',
  email_change: 'Confirm your Fluxentiq email change',
}
const subject = subjectByAction[action] ?? 'Your Fluxentiq verification code'

const html = `
  <main style="background:#f4f8fc;padding:32px;font-family:Arial,sans-serif;color:#172236">
    <section style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dce6f2;border-radius:18px;padding:32px">
      <p style="margin:0;color:#3578f6;font-size:11px;font-weight:700;letter-spacing:1.6px">FLUXENTIQ AI HR</p>
      <h1 style="margin:16px 0 8px;font-size:26px">${subject}</h1>
      <p style="margin:0;color:#617089;font-size:14px;line-height:1.6">Enter this one-time code in Fluxentiq to continue. Do not share it with anyone.</p>
      <div style="margin:24px 0;padding:18px;border-radius:12px;background:#edf4ff;color:#245dc5;font-size:30px;font-weight:700;letter-spacing:8px;text-align:center">${otp}</div>
      <p style="margin:0;color:#8795aa;font-size:12px;line-height:1.5">If you did not request this, you can safely ignore this email.</p>
    </section>
  </main>
`

return [{
  json: {
    to: recipient,
    subject,
    html,
    otp,
    action,
  },
}]
```

n8n Cloud makes Node's built-in `crypto` module available to Code nodes. Use
that to validate the Supabase Standard Webhooks signature before the Gmail node
is allowed to send a message.

## Gmail node mapping

Use these expressions in the Gmail Send Message node:

```text
To:      ={{ $json.to }}
Subject: ={{ $json.subject }}
Email type: HTML
Message: ={{ $json.html }}
```

Then connect Gmail to `Respond to Webhook` with:

```json
{}
```

and HTTP status `200`.

## Supabase dashboard configuration

After the n8n workflow is activated:

1. Open **Authentication → Hooks → Send Email Hook**.
2. Select **HTTPS**.
3. Enter the production n8n URL:

   ```text
   https://hrmanagerfluxentiqai.app.n8n.cloud/webhook/Email
   ```

4. Generate a Hook secret.
5. Store it as the protected n8n variable described above.
6. Enable the hook only after the n8n Gmail workflow is active.

## Test flow

1. In Fluxentiq choose **Create account** or **Resend confirmation email**.
2. Supabase invokes n8n with its signed event.
3. n8n sends the code through Gmail.
4. Enter that code in Fluxentiq's verification form.
5. Fluxentiq verifies the code against Supabase Auth and continues to workspace bootstrap.
