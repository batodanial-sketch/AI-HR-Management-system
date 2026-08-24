# Fluxentiq AI HR — E2E Testing Guide

Playwright end-to-end suite for the Fluxentiq AI HR Management System
(Supabase PostgreSQL → Next.js App Router → Python `server.py` bridge).

## 1. Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| Supabase CLI | latest (`npm i -g supabase`) |
| Python | 3.10+ (for `server.py`) |
| Playwright browsers | `npx playwright install --with-deps` |

Required environment variables (`.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=…
SUPABASE_SERVICE_ROLE_KEY=…
SUPABASE_PROJECT_REF=…
E2E_TEST_USER_EMAIL=…
E2E_TEST_USER_PASSWORD=…
E2E_BASE_URL=http://localhost:3000        # optional, defaults as shown
E2E_WEBSERVER_COMMAND=…                   # optional, overrides the dev command
```

## 2. Local run

```bash
# one-shot: migrate, boot bridge + Next.js, launch Playwright UI
./scripts/run-e2e-local.sh ui

# or manually
supabase start
supabase db reset          # applies ALL migrations including 000300 & 000400
npm run dev &              # Next.js (Playwright also auto-starts it)
python3 server.py &        # bridge
npx playwright test
```

Scripts:

| Command | Purpose |
|---------|---------|
| `npm run test:e2e` | headless run |
| `npm run test:e2e:ui` | interactive UI mode |
| `npm run test:e2e:debug` | inspector / step-through |
| `npm run test:e2e:headed` | headed browser |
| `npm run test:e2e:update-snapshots` | (re)generate visual baselines |

## 3. Migration application

The suite expects these migrations applied to local Supabase before any run:

- `000300_…` — leave + payroll schema (attendance-leave, payroll-run suites).
- `000400_…` — Google Workspace provisioning + access requests
  (`20260815000400_google_workspace_access_requests.sql`).

`supabase db reset` applies every migration in order plus `supabase/seed.sql`,
which is the canonical path used by both the shell script and CI.

## 4. Google Workspace SSO & access requests

The six provisioning decision paths are encoded in
`e2e/utils/google-workspace.ts` (`WorkspaceDecisionPath`) and seeded in
`e2e/utils/domain-seed.ts`:

1. `existing_membership_allowed`
2. `invited_membership_activated`
3. `membership_required` → triggers the pending access-request state via
   `POST /api/auth/request-access`
4. `domain_not_provisioned`
5. `personal_account_blocked`
6. `ambiguous_domain_blocked`

The external Google OAuth round-trip is mocked with `page.route()` on
`/api/auth/sso-callback`; the **internal** rules are exercised against the real
Supabase instance (`access_requests`, `workspace_domains`, `workspace_memberships`,
`workspace_invites`). Signed-token completion is tested through
`POST /api/auth/complete-access-request` (valid token → `activated`, invalid →
`invalid`).

The `auth.spec.ts` suite starts **unauthenticated** (it clears the global
`storageState`), while every other suite runs against the session created by
`e2e/global-setup.ts`.

## 5. Page-object rules

- All page objects extend `e2e/page-objects/BasePage.ts` and interact **only**
  through `data-testid` markers documented in each file's header.
- Fixtures are registered in `e2e/fixtures/customTest.ts`; add new POMs there.
- Every locator is typed; no `any`, no placeholders, no `// TODO`.
- `data-value` attributes carry raw numeric/metric values for assertion
  (avoiding locale/formatting parsing).

## 6. Seeding & cleanup

- `global-setup.ts` seeds baseline employees/candidates and the E2E user.
- Domain-specific suites seed their own data in `beforeAll` and clean up in
  `afterAll` via `e2e/utils/domain-seed.ts` (`seedLeaveData`, `seedPayrollData`,
  `seedWorkspaceData` + matching `cleanup*`).
- `global-teardown.ts` removes every `source_tag = 'e2e'` row and the test user.

## 7. Mock assets

`e2e/data/mock-resume.ts` and `e2e/data/mock-receipt.ts` generate valid PDF/JPEG
buffers in-memory (no binary fixtures committed) for upload/OCR flows.

## 8. Visual regression

`visual-regression.spec.ts` uses `toHaveScreenshot`. Baselines live in
`e2e/specs/__screenshots__`. Generate them once and commit:

```bash
npx playwright test e2e/specs/visual-regression.spec.ts --update-snapshots
```

`maxDiffPixelRatio` is 0.02; adjust in the spec if your CI platform renders
fonts with wider sub-pixel variance.

## 9. CI troubleshooting

- **`supabase start` fails** — ensure the Docker daemon is running and ports
  54322/54321 are free.
- **Missing env** — `global-setup.ts` throws with the exact variable name; the
  workflow supplies Supabase values from `supabase status -o env`.
- **Visual diff flakes** — bump `maxDiffPixelRatio` (0.02 → 0.05) or mask the
  live clock/avatar region rather than deleting baselines.
- **Shard isolation** — each shard runs `global-setup` independently; test data
  is `source_tag`-scoped so parallel workers do not collide.
