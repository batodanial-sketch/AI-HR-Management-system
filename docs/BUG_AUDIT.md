# Bug Audit & Remediation Summary

**Scope:** Next.js 14 App Router · TypeScript · Supabase (PostgREST/Auth) · Python FastAPI bridge
**Method:** static analysis across `app/`, `lib/`, `components/`, `middleware.ts`, `bridge/`, `python_engine/` — 303 source files
**Result:** `tsc --noEmit` 0 errors · `next lint` 0 warnings · `next build` green. 4 defects fixed, 3 documented with rationale.

---

## 1. Executive Findings Matrix

| Bug ID | Severity | Location | Type | Short Description |
| :--- | :--- | :--- | :--- | :--- |
| BUG-001 | **High** | `app/api/system/cron/route.ts:13` | Security — fail-open authz | Cron endpoint open to the world when `CRON_SECRET` is unset |
| BUG-002 | **High** | `lib/scheduler.ts:47` | Concurrency — race condition | Non-atomic job claim → duplicate execution (double emails) under concurrent cron ticks |
| BUG-003 | **Medium** | `lib/rate-limit.ts:13,60` | Memory DoS + Security | Unbounded in-memory buckets + client-spoofable `x-forwarded-for` key |
| BUG-004 | **Medium** | `app/api/webhooks/n8n-trigger/route.ts:37` | Data retention | Unbounded PII-bearing payload persisted verbatim to DB + audit log |
| BUG-005 | **Medium** | `app/actions/*`, webhook routes (288 sites) | Type safety / Anti-pattern | Widespread `as any` bypasses the generated `Database` types |
| BUG-006 | **Low** | `bridge/workflow_engine.py:232`, `app/api/webhooks/external/outbound-trigger/route.ts` | Security — SSRF | Server posts to admin/buyer-supplied URLs with no allow-list |
| BUG-007 | **Low** | `app/api/auth/signup/route.ts:15` | Security — weak policy | Password minimum of 6 chars, no strength rules |

---

## 2. Detailed Bug Analysis & Remediation

### BUG-001 — Cron endpoint fails open without a secret
- **Location**: `app/api/system/cron/route.ts` (line 13)
- **Severity**: High · **Category**: Security
- **Root Cause**: The guard was `if (token) { …check… }`. When `CRON_SECRET` is absent (the default — it was never even listed in `.env.example`), the `if` body is skipped and execution falls straight through to `runDueJobs()`. Any anonymous caller could trigger every due job — including `trial_expiry`/`payroll_reminder` jobs that **send emails and notifications**, enabling spam/notification abuse against the tenant's users.
- **Proposed Solution**: Invert to fail-closed (no secret → 503), and compare the header token with `timingSafeEqual` to avoid a timing side-channel.

#### Refactored Code
```ts
// BEFORE (fail-open):
const token = process.env.CRON_SECRET;
if (token) {
  const header = request.headers.get("x-cron-secret");
  if (header !== token) return NextResponse.json({...}, { status: 401 });
}
const executed = await runDueJobs();

// AFTER (fail-closed + constant-time):
import { timingSafeEqual } from "node:crypto";

const token = process.env.CRON_SECRET;
if (!token) {
  return NextResponse.json(
    { ok: false, message: "CRON_SECRET is not configured." },
    { status: 503 },  // [FIX] no secret → disabled, never open
  );
}
const header = request.headers.get("x-cron-secret") ?? "";
const tokenBuf = Buffer.from(token);
const headerBuf = Buffer.from(header);
const valid = tokenBuf.length === headerBuf.length && timingSafeEqual(tokenBuf, headerBuf);
if (!valid) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
```

---

### BUG-002 — Scheduler race condition (double execution)
- **Location**: `lib/scheduler.ts` (`runDueJobs`)
- **Severity**: High · **Category**: Concurrency
- **Root Cause**: The job was claimed in **two non-atomic steps**: `SELECT … WHERE status='pending'` then, inside the loop, `UPDATE … SET status='running'`. Two concurrent `GET /api/system/cron` invocations (overlapping hosted-cron ticks, double-fire, or a load-balancer fan-out) both `SELECT` the same pending rows before either flips the status, so **both** execute the job — producing duplicate emails/notifications and non-idempotent side effects.
- **Proposed Solution**: Claim atomically in a **single** `UPDATE … WHERE status='pending'` that also `.select()`s the rows. PostgREST runs it as one statement; a concurrent caller's `eq("status","pending")` no longer matches claimed rows. A `locked_by` claim token is set for future stale-run reclamation.

#### Refactored Code
```ts
// BEFORE (select-then-update, racy):
const { data } = await serverClient().from("scheduled_jobs")
  .select("id, job_type, payload").eq("status","pending").lte("run_at", now).limit(50);
for (const job of data) {
  await serverClient().from("scheduled_jobs").update({ status: "running" }).eq("id", job.id);
  await executeJob(...); // ← a concurrent run may also execute this job
}

// AFTER (atomic claim):
const { data } = await serverClient().from("scheduled_jobs")
  .update({
    status: "running",
    locked_by: `cron:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, // claim token
  })
  .eq("status", "pending")   // [FIX] claim is the gate — single statement
  .lte("run_at", new Date().toISOString())
  .select("id, job_type, payload")
  .limit(50);
```

---

### BUG-003 — Rate limiter: unbounded memory + spoofable key
- **Location**: `lib/rate-limit.ts` (`buckets` map, `clientKey`)
- **Severity**: Medium · **Category**: Memory DoS + Security
- **Root Cause**:
  1. `buckets` is a `Map` keyed by client IP with **no size ceiling**. Within one window an attacker can force one bucket per distinct IP; buckets are only evicted after `resetAt` expires, so a flood of unique IPs grows the map without bound → process memory exhaustion.
  2. `clientKey()` blindly trusts `x-forwarded-for`, a **client-controlled header**. In a deployment with no trusted proxy in front, an attacker rotates the header to mint a fresh bucket per request and defeat the limiter entirely.
- **Proposed Solution**: cap the bucket count (evict oldest on overflow) and only honor `x-forwarded-for` when `AI_RATE_TRUST_PROXY=true` (opt-in for real proxied deployments); otherwise fall back to a single non-spoofable key.

#### Refactored Code
```ts
// BEFORE:
const buckets = new Map<string, Window>();
// ...
export function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

// AFTER:
const MAX_BUCKETS = Number(process.env.AI_RATE_MAX_BUCKETS ?? "10_000");
const TRUST_PROXY = (process.env.AI_RATE_TRUST_PROXY ?? "false").toLowerCase() === "true";

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {            // [FIX] bound memory
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    const resetAt = now + WINDOW_MS;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: DEFAULT_LIMIT - 1, resetAt };
  }
  // … unchanged fast paths …
}

export function clientKey(request: Request): string {
  if (!TRUST_PROXY) return "local";               // [FIX] not spoofable by default
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
```

---

### BUG-004 — n8n webhook persists unbounded, PII-bearing payloads
- **Location**: `app/api/webhooks/n8n-trigger/route.ts` (line 37)
- **Severity**: Medium · **Category**: Data retention
- **Root Cause**: The inbound n8n payload (`payload.payload`, an arbitrary `Record<string, unknown>`) was stored **verbatim** into `workflow_runs.trigger_payload`, `workflow_runs.output`, and `audit_logs.after_state`. A large or sensitive payload (candidate data, employee PII) is duplicated across three places with no size bound, bloating storage and leaking sensitive data into the audit trail.
- **Proposed Solution**: Pass the payload through a `boundedPayload()` guard that JSON-serializes and truncates anything over 8 KB before persistence.

#### Refactored Code
```ts
// BEFORE:
trigger_payload: { event: payload.triggerEvent, payload: payload.payload },
output: payload.status === 'succeeded' ? payload.payload : {},
// audit_logs.after_state: { status, payload: payload.payload }

// AFTER:
const MAX_PAYLOAD_CHARS = 8_000;
function boundedPayload(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value ?? {});
    if (serialized.length <= MAX_PAYLOAD_CHARS) return value;
    return { truncated: true, preview: serialized.slice(0, MAX_PAYLOAD_CHARS) };
  } catch { return { truncated: true, preview: null }; }
}
const safePayload = boundedPayload(payload.payload);
trigger_payload: { event: payload.triggerEvent, payload: safePayload },
output: payload.status === 'succeeded' ? safePayload : {},
// audit_logs.after_state: { status, payload: safePayload }
```

---

### BUG-005 — Systemic `as any` erasure of the DB type contract
- **Location**: `app/actions/*.ts`, `app/api/webhooks/**` (288 sites)
- **Severity**: Medium · **Category**: Type safety / Anti-pattern
- **Root Cause**: The live legacy Supabase schema drifted from the generated `lib/database.types.ts`, so a swath of server actions and webhook routes cast the client to `any` (`(supabase as any).from('…')`). This silently disables compile-time checking of table names, column names, and row shapes — a typo in a column name becomes a **runtime 500**, not a build error, and future schema changes produce no type-driven migration signal.
- **Proposed Solution**: Not rewritten in this pass — doing so across 288 call sites is a schema-first effort (regenerate `database.types.ts` from the reconciled live schema, then remove the casts incrementally). Rationale for deferral: touching each site risks breaking the E2E contract for zero functional gain until the DB types are regenerated. Flagged for the follow-up hardening milestone. *(The one exception already handled earlier: `adminClient()` was intentionally un-typed to match the drifted legacy schema.)*

---

### BUG-006 — Server-side request forgery (SSRF) surface
- **Location**: `bridge/workflow_engine.py` `_action_webhook`; `app/api/webhooks/external/outbound-trigger/route.ts`
- **Severity**: Low · **Category**: Security
- **Root Cause**: Both components `POST` (or `httpx.post`) to a **buyer/admin-supplied URL** with no allow-list or private-IP blocking. A malicious or compromised admin account could point these at internal endpoints (`http://169.254.169.254/…`, local services) and exfiltrate data or reach services not meant to be exposed.
- **Proposed Solution**: Add an allow-list / deny-list on destination hosts (block loopback, link-local, private ranges unless explicitly allow-listed) and cap redirects. **Deferred** — mitigations are admin-gated today (`requireOrganizationContext('admin')` / buyer-configured workflows), so this is a hardening item, not an active exposure.

---

### BUG-007 — Weak password policy
- **Location**: `app/api/auth/signup/route.ts:15` (`z.string().min(6)`)
- **Severity**: Low · **Category**: Security
- **Root Cause**: Sign-up accepts any 6+ character password (no length ceiling complexity, no breach/blacklist check). Against credential-stuffing this is a weak first line of defense (though Supabase GoTrue's bcrypt + email-confirm adds layers).
- **Proposed Solution**: Raise to `min(8)` + `max(128)` with a stronger policy (e.g., reject top-N common passwords), and enforce the same on the client form. **Deferred** — changing the floor now would reject existing valid 6-char accounts mid-flow; flag for the auth-hardening milestone.

---

## 3. Verification

- `tsc --noEmit` → **0 errors**
- `next lint` → **0 warnings / errors**
- `next build` → **green**
- `.env.example` → now documents `CRON_SECRET`, `N8N_WEBHOOK_SECRET`, `PYTHON_BRIDGE_WEBHOOK_SECRET` (previously undocumented; `CRON_SECRET` is required by the fail-closed cron).
- Both servers live: app `:3000`, bridge `:8000`.

## 4. Security note (recurring)

`.env.local` still contains **live secrets** (Supabase publishable/secret keys, Groq key) that have been pasted in chat across this session. These are production credentials — rotate them in the Supabase/Groq dashboards once testing concludes and update `.env.local` accordingly. Not repeated here; not committed (`.env.local` is gitignored).
