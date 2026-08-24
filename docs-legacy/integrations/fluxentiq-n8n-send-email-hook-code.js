/*
 * Fluxentiq production n8n Code node
 * Mode: Run Once for All Items
 *
 * Workflow:
 * Webhook (POST /Email, Raw Body enabled)
 *   -> this Code node
 *   -> Gmail Send Message
 *   -> Respond to Webhook (HTTP 200, {})
 */

const crypto = require('crypto')

const item = $input.first()

const headers = Object.fromEntries(
  Object.entries(item.json.headers ?? {}).map(([key, value]) => [
    key.toLowerCase(),
    Array.isArray(value) ? String(value[0]) : String(value),
  ]),
)

function readRawBody() {
  if (typeof item.json.rawBody === 'string') return item.json.rawBody
  if (typeof item.json.body === 'string') return item.json.body

  for (const key of ['data', 'body', 'rawBody']) {
    const binary = item.binary?.[key]
    if (binary?.data) return Buffer.from(binary.data, 'base64').toString('utf8')
  }

  throw new Error('Raw Body is unavailable. Enable Raw Body in the n8n Webhook node.')
}

function getSecretBytes(value) {
  const normalized = value
    .trim()
    .replace(/^v1,/, '')
    .replace(/^whsec_/, '')

  const decoded = Buffer.from(normalized, 'base64')
  if (decoded.length === 0) {
    throw new Error('SUPABASE_AUTH_EMAIL_HOOK_SECRET is not a valid Standard Webhooks secret.')
  }

  return decoded
}

function getV1Signatures(value) {
  return value
    .split(' ')
    .map((signature) => signature.trim())
    .filter((signature) => signature.startsWith('v1,'))
    .map((signature) => signature.slice(3))
}

function timingSafeSignatureMatch(expected, supplied) {
  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = Buffer.from(supplied)

  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
}

const hookSecret = $vars.SUPABASE_AUTH_EMAIL_HOOK_SECRET
if (!hookSecret) {
  throw new Error('Missing n8n variable SUPABASE_AUTH_EMAIL_HOOK_SECRET.')
}

const webhookId = headers['webhook-id']
const webhookTimestamp = headers['webhook-timestamp']
const webhookSignature = headers['webhook-signature']

if (!webhookId || !webhookTimestamp || !webhookSignature) {
  throw new Error('Missing Supabase Standard Webhooks signature headers. Test with a real Supabase signup or resend action, not n8n Execute Step.')
}

const timestamp = Number(webhookTimestamp)
const fiveMinutes = 5 * 60
if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > fiveMinutes) {
  throw new Error('Supabase webhook timestamp is outside the five-minute verification window.')
}

const rawBody = readRawBody()
const expectedSignature = crypto
  .createHmac('sha256', getSecretBytes(hookSecret))
  .update(`${webhookId}.${webhookTimestamp}.${rawBody}`)
  .digest('base64')

const signatureIsValid = getV1Signatures(webhookSignature)
  .some((suppliedSignature) => timingSafeSignatureMatch(expectedSignature, suppliedSignature))

if (!signatureIsValid) {
  throw new Error('Invalid Supabase Send Email Hook signature.')
}

const event = JSON.parse(rawBody)
const emailData = event.email_data ?? {}
const recipient = String(event.user?.email ?? '')
const action = String(emailData.email_action_type ?? 'signup')
const otp = String(emailData.token ?? emailData.token_new ?? '')

if (!recipient) {
  throw new Error('Supabase Send Email Hook payload did not include the recipient email.')
}

if (!/^\d{6,10}$/.test(otp)) {
  throw new Error('Supabase Send Email Hook payload did not include a valid numeric OTP.')
}

const contentByAction = {
  signup: {
    eyebrow: 'Secure account verification',
    headline: 'Welcome to Fluxentiq.',
    description: 'Use this one-time code to verify your email address and enter your intelligent HR workspace.',
    subject: 'Verify your Fluxentiq email',
  },
  recovery: {
    eyebrow: 'Secure password recovery',
    headline: 'Reset your Fluxentiq password.',
    description: 'Use this one-time code to continue your secure password recovery request.',
    subject: 'Your Fluxentiq password recovery code',
  },
  magiclink: {
    eyebrow: 'Secure sign-in verification',
    headline: 'Sign in to Fluxentiq.',
    description: 'Use this one-time code to complete your secure Fluxentiq sign-in.',
    subject: 'Your Fluxentiq sign-in code',
  },
  invite: {
    eyebrow: 'Workspace invitation',
    headline: 'You are invited to Fluxentiq.',
    description: 'Use this one-time code to accept your invitation and join the workspace.',
    subject: 'Your Fluxentiq invitation code',
  },
  email_change: {
    eyebrow: 'Secure email change',
    headline: 'Confirm your new email.',
    description: 'Use this one-time code to approve the email address change for your Fluxentiq account.',
    subject: 'Confirm your Fluxentiq email change',
  },
}

const content = contentByAction[action] ?? {
  eyebrow: 'Secure account verification',
  headline: 'Your Fluxentiq verification code.',
  description: 'Use this one-time code in Fluxentiq to continue securely.',
  subject: 'Your Fluxentiq verification code',
}

const formattedOtp = otp.split('').join('&nbsp;&nbsp;')
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <title>${content.subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#070a11;color:#e8edf7;font-family:Inter,Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${content.description}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:0;background-color:#070a11;">
      <tr>
        <td align="center" style="padding:36px 16px 44px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
            <tr>
              <td style="padding:0 8px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle" style="width:34px;height:34px;border-radius:10px;background-color:#3578f6;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;line-height:34px;color:#ffffff;">F</td>
                    <td valign="middle" style="padding-left:10px;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:700;letter-spacing:-0.4px;">Fluxentiq</td>
                    <td valign="middle" style="padding-left:10px;color:#8e9bb3;font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;">AI HR OS</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="border:1px solid #202a3b;border-radius:20px;background-color:#101722;overflow:hidden;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr><td style="height:5px;background-color:#3578f6;font-size:0;line-height:0;">&nbsp;</td></tr>
                  <tr>
                    <td style="padding:42px 40px 18px;">
                      <p style="margin:0 0 14px;color:#9ec7af;font-size:11px;font-weight:700;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;">${content.eyebrow}</p>
                      <h1 style="margin:0;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:700;letter-spacing:-1px;line-height:42px;">${content.headline}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 40px 0;">
                      <p style="margin:0;color:#c4cedd;font-size:16px;line-height:26px;">${content.description}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:30px 40px 0;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #28364d;border-radius:14px;background-color:#0b111a;">
                        <tr><td align="center" style="padding:18px 18px 8px;color:#aebbd0;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:16px;text-transform:uppercase;">Your one-time verification code</td></tr>
                        <tr><td align="center" style="padding:4px 14px 9px;color:#ffffff;font-family:Consolas,'Courier New',monospace;font-size:29px;font-weight:700;letter-spacing:4px;line-height:38px;white-space:nowrap;">${formattedOtp}</td></tr>
                        <tr><td align="center" style="padding:2px 18px 19px;color:#8e9bb3;font-size:12px;line-height:18px;">Return to Fluxentiq and enter this code on the verification screen.</td></tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px 40px 0;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #202a3b;">
                        <tr><td style="padding-top:22px;"><p style="margin:0;color:#aebbd0;font-size:13px;line-height:21px;">If you did not request this, you can safely ignore this email. Never share this verification code with anyone.</p></td></tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 40px 40px;"><p style="margin:0;color:#71809a;font-size:11px;line-height:18px;">This code is generated and validated by Supabase Auth. Fluxentiq will never ask for it outside the verification screen.</p></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px;color:#71809a;font-size:12px;line-height:19px;">
                <p style="margin:0;">Fluxentiq &middot; Intelligent HR, thoughtfully operated.</p>
                <p style="margin:6px 0 0;">This is an automated security message. Please do not reply.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

const text = `${content.subject}\n\n${content.description}\n\nVerification code: ${otp}\n\nIf you did not request this, you can safely ignore this email. Never share this code with anyone.`

return [{
  json: {
    to: recipient,
    subject: content.subject,
    html,
    text,
    otp,
    action,
  },
}]
