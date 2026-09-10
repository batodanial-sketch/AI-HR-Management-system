# FLUXENTIQ AI — PRODUCT EVOLUTION GAP MATRIX

**Date:** 2026-09-10 · **Baseline release:** `4368523` · **Carrier:** `353ee55` · **Method:** full-repo inspection (routes, lib, actions, schema, UI, tests, docs) — nothing assumed missing by name; every verdict cites evidence.
**Legend:** COMPLETE (mature — preserve) · PARTIAL (works, real gaps) · MISSING (no implementation) · NEEDS HARDENING (works but has a security/product-integrity weakness) · NOT_IMPLEMENTED_EXTERNAL (needs real infrastructure; stays BLOCKED_EXTERNAL).

---

## 1. AI PROVIDERS / ROUTING / FALLBACK

| Capability | Verdict | Current implementation + evidence |
|---|---|---|
| Multi-provider LLM (groq/openai/gemini/anthropic/custom) | COMPLETE | `bridge/providers/*`, `bridge/ai_client.py` (streaming planner, evaluate/rank/parse/report/insights/PTO), model catalog mirrored in `lib/ai-providers.ts` |
| Cost estimation + token echo | COMPLETE | `bridge/cost.py`, `X-Cost-Usd`/`X-*-Tokens` headers, `lib/ai/telemetry.ts estimateCostUsd` |
| Usage metering (tokens/cost/latency) | COMPLETE | `ai_token_usage` + `ai_usage_logs` + legacy `ai_usage`; `recordAiTelemetry` (never throws); `getAiUsageSummary` by feature/model |
| Budget caps + warnings + fallback hints | COMPLETE | `ai_budget_settings`, `checkAiBudget` (ok/warning/exceeded), enforced in copilot route; `/api/settings/ai-budget` (GET any member, PATCH HR_ADMIN+) + `AiBudgetPanel` |
| Usage dashboard UI | COMPLETE | `app/(dashboard)/settings/ai-usage` + `AiUsageDashboard` (per-feature, logs, CSV) |
| Provider breakdown / failure + latency aggregation | NEEDS HARDENING · P1 | `getAiUsageSummary` has no per-provider split, no failure counts, no latency stats; `status` is recorded but never aggregated. User value: diagnose degradation + spend by provider. Difficulty: S. Security: read-only aggregation, org-scoped — none. |
| Primary→backup execution failover | PARTIAL · P1 | Fallback model/provider are *configured* (`ai_budget_settings`, budget hints) but no execution path switches providers on 429/5xx/timeout; bridge has retry/backoff only. User value: AI keeps working during provider outages. Business: pilot SLA story. Difficulty: M (bridge `ai_client` failover + metadata + pytest; live E2E stays BLOCKED_EXTERNAL). Security: must record provider/model/fallback metadata, never fabricate output. |

## 2. COPILOT / AGENT PLATFORM

| Capability | Verdict | Current implementation + evidence |
|---|---|---|
| Tool catalog + zod arg validation | COMPLETE | 17 tools in `lib/ai-providers.ts` + `lib/copilot/tools.ts` (read/write kinds, Zod schemas, cookie-forwarded execution inheriting caller RBAC) |
| Write confirmations (server proposals) | COMPLETE | `lib/copilot/proposals.ts` (frozen+hashed args, 15-min TTL, claim-one-winner, receipt, audit); legacy `confirmToolCall` rejected |
| Orchestrator (budget/rate/pilot/rounds/SSE/audit) | COMPLETE | `app/api/ai/copilot/route.ts` (564 lines): budget gate, tier rate limits, pilot controls, max 3–5 tool rounds, SSE, `COPILOT_AGENT` audit, telemetry |
| Pilot safety controls | COMPLETE | `lib/pilot/controls.ts` (kill switch, org allowlist, token ceiling, round cap) |
| Admin copilot | COMPLETE | `app/api/ai/admin-copilot/route.ts` (HR_ADMIN deny-first) |
| Agent router (intent → agent policy) | MISSING · P0 | Single orchestrator, no intent classification, no named agents. §9 target. Difficulty: M. Depends on: taxonomy, new read tools. |
| HITL action taxonomy (READ/ANALYZE/PROPOSE/WRITE/CONSEQUENT) | NEEDS HARDENING · P0 | Proposal lifecycle implements WRITE/CONSEQUENT correctly, but no central taxonomy: per-tool categories undocumented, no single policy module. Difficulty: S. Security: must not widen any tool's handling. |
| Intelligence agent tools (insights/briefing) | MISSING · P0 | Catalog has no insight/briefing/candidate/job/knowledge search tools (only `screen_candidate` write + `fetch_*` CRUD). Difficulty: M (3–4 read tools + routes). |
| Recruitment agent | MISSING · P0 | No agent; only `screen_candidate` tool + kanban UI. Difficulty: M (router + policy + search/match tools + confirmations reuse). |
| Conversation/session memory | PARTIAL · P1 | `assistant_conversations/messages` + `copilotActions` (create/append/get) exist; UI persistence wiring unverified; no org-knowledge/user-pref/operational tiers. Difficulty: M. Security: strict tenant scoping required. |
| Organization knowledge memory | MISSING · P1 | No `company_knowledge` table, no retrieval API, no grounded-answer envelope. See §5. |

## 3. INTELLIGENCE (WORKFORCE / BRIEFINGS / ALERTS)

| Capability | Verdict | Current implementation + evidence |
|---|---|---|
| Deterministic predictive base | COMPLETE | `lib/analytics/predictive.ts` (flight risk, expense anomalies, runway forecast, eNPS, offboarding pressure) + `lib/analytics/insights.ts` aggregator; executive dashboard renders them |
| Unified insight envelope (insight/evidence/confidence/scope/freshness/explanation/next action) | MISSING · P0 | Current outputs are raw numbers/factors — no confidence, freshness, explanation, or INSUFFICIENT_DATA semantics. Difficulty: M. |
| Workforce signals (attendance/leave/recruitment/dept/approvals/docs/workflows) | MISSING · P0 | Only expense/pulse/offboarding/planning/equity signals exist. Attendance/leave/recruitment data exists but has zero signal computation. Difficulty: M. |
| Proactive briefing engine | MISSING · P0 | No briefing composer, route, or UI. Depends on: insight envelope. Difficulty: M. |
| Alert system (severity/evidence/status/action/dedup) | MISSING · P0 | Notifications are event writes, not derived alerts; no severity/status/recommended-action/dedup. Difficulty: M. |
| Command center | PARTIAL · P1 | Dashboards exist (`/dashboard`, `/analytics`, `/workforce` org chart) but no unified workforce+recruitment+operations+AI view with insights/alerts/usage. Difficulty: M. |

## 4. RECRUITMENT INTELLIGENCE

| Capability | Verdict | Current implementation + evidence |
|---|---|---|
| Recruitment CRUD (jobs/candidates/applications/interviews) | COMPLETE | `app/actions/recruitmentActions.ts` (HR_ADMIN scope), interviews+participants with rollback, audit; kanban UI; `/recruitment/new`; screening route + assessments + interview kits |
| LLM screen/rank/evaluate via bridge | COMPLETE | `evaluate-candidate`, `rank-candidates`, `interview-report`, `parse-resume` proxies + `bridge/ai_client.py`; `queueAiScreeningAction` job flow |
| Deterministic explainable matching (coverage/missing/confidence/explanation) | MISSING · P0 | Ranking is LLM-opaque: no requirement coverage, missing-requirements list, confidence, evidence links, or fairness guardrails in code. Difficulty: M. Security: must use only non-sensitive fields; never infer protected characteristics; ADVANCE/HOLD/REJECT_REVIEW advisory only. |
| `GET /api/candidates` bounded search | MISSING · P0 | No route (verified: `app/api/candidates` absent). Brief §7: query/limit/stage + minimal projections. Difficulty: S. Security: HR_ADMIN+, PII-minimized projection, tenant-scoped. |
| Candidate semantic search (local) | PARTIAL · P1 | `semantic-search`/`match-candidate` proxy to external `PYTHON_SEMANTIC_SEARCH_URL` (dormant w/o operator); engine has `candidate_semantic_search` + in-memory vector store + hash embeddings (fail-closed when disabled). Honest but thin. |
| match/semantic route authorization | NEEDS HARDENING · P0 | Both routes rely on middleware session-gate only — any authenticated EMPLOYEE can invoke org-wide candidate matching. Recruitment scope elsewhere is HR_ADMIN. Fix: deny-first `requireRole(HR_ADMIN)`. Difficulty: XS. No callers exist (dormant), so no breakage. |
| JD analysis / requirement extraction | MISSING · P1 | No deterministic JD parsing (folds into matching work as requirement extractor). Difficulty: S. |

## 5. KNOWLEDGE / MEMORY / SEARCH / PALETTE

| Capability | Verdict | Current implementation + evidence |
|---|---|---|
| Company knowledge base | MISSING · P1 | No table/API/UI/retrieval; only "knowledge" hits are `policy_acknowledgements` (false positive) and a commented-out `embedding vector(1536)` in `resumes`. Difficulty: M (migration+RLS+keyword search API+tool). Security: org-scoped RLS, RBAC read/write split. |
| Grounded-answer envelope (KNOWN/INFERRED/UNKNOWN) | MISSING · P1 | No composer; depends on knowledge retrieval. Difficulty: S. |
| Global search | MISSING · P1 | No `/api/search`, no UI. Difficulty: M. Security: per-resource authorization, no unrestricted DB endpoint. |
| Command palette | MISSING · P1 | No cmdk/palette anywhere. Difficulty: M. Security: authorization-aware command filtering. |
| User preferences / operational memory | MISSING · P2 | No user-pref store; operational state = audit/proposals (sufficient for now). Difficulty: S–M. |

## 6. HR CORE / WORKFLOWS / DOCUMENTS / NOTIFICATIONS

| Capability | Verdict | Current implementation + evidence |
|---|---|---|
| Employees/attendance/leave/performance/docs | COMPLETE | Full CRUD + RBAC scopes + RLS; leave request flow; performance cycles/reviews; document pipeline (validate/scan/store) |
| Workflow engine (daily tasks, idempotent) | COMPLETE | `lib/workflow-engine.ts` + 1120-line `workflowActions.ts` (templates, runs, steps, executions, atomic claims); builder + automations UI; trigger/webhook routes |
| Onboarding/offboarding/recruitment lifecycle templates | PARTIAL · P1 | Engine is generic (attendance/pulse/anomaly templates only); no onboarding/offboarding/recruitment pipeline templates with step execution. Difficulty: L (new step types + executors). Defer behind P0/P1. |
| Document intelligence (parse/OCR/extract) | PARTIAL · P1 | Real deterministic modules (`resume_parser`, OCR, sentiment, topics, tax, payroll reconcile, payslip/cert PDF) + LLM via bridge; missing: JD analysis (→§4), doc generation/summarization endpoints. Difficulty: M. |
| Notifications service + center | PARTIAL · P1 | `lib/notifications.ts` (create/list/mark-all/unread), route, page, top-nav; missing: severity/source/action fields, single-read, `stream/route.ts` is 0 bytes (SSE unimplemented). Difficulty: M. |
| Scheduler + cron | COMPLETE | `lib/scheduler.ts` (atomic claim, idempotent), `CRON_SECRET` endpoints |
| Storage + scanner + webhooks + SCIM + GraphQL | COMPLETE | Per audit evidence; unchanged by this evolution |

## 7. COMMERCIAL / ADMIN / ONBOARDING / UX

| Capability | Verdict | Current implementation + evidence |
|---|---|---|
| License tiers + trial + seats | COMPLETE | `lib/license.ts` (tiers, trial caps), `lib/seats.ts` (capacity enforcement), license API, pricing page |
| Billing abstraction (plans/entitlements/subscription/provider/invoices, explicitly disabled) | MISSING · P2 | Billing is NOT_IMPLEMENTED with no abstraction. Brief §24 asks for a clean disabled abstraction, not fake billing. Difficulty: S–M. No security surface (disabled provider rejects). |
| Enterprise admin (org/roles/seats/AI/integrations/audit/retention/webhooks/notif-prefs) | PARTIAL · P2 | Settings pages exist (system/license/studio/ai-usage/audit-logs); gaps: retention settings, webhook config UI, notification prefs, seat mgmt UI. Difficulty: M. |
| Org first-run onboarding | PARTIAL · P1 | Employee onboarding (actions/tasks/assets) COMPLETE; org first-run = thin workspace form (`app/onboarding`). Difficulty: M. |
| UX quality (loading/empty/error/a11y/keyboard) | PARTIAL · P2 | Varies by page; new surfaces must set the standard (skeletons, empty states, destructive confirms). Difficulty: ongoing. |

## 8. TESTING / EVAL / SECURITY GATES

| Capability | Verdict | Current implementation + evidence |
|---|---|---|
| Unit (Jest 108) + pytest (15) + e2e + cognitive evidence | COMPLETE | `tests/unit/*`, `python_engine/tests/*`, `tests/e2e/*`, `phase-r-cognitive.json`; RLS 76/76, authz-dup 21/21, preflight 8/8, audit 0 |
| Agent eval dimensions for NEW agents | PARTIAL · P0 | Router/tool-selection, grounding, no-data honesty, tenant safety, injection resistance, consequential-approval, loop safety need new deterministic cases. Difficulty: M (part of each P0 build). |
| Security regression gates | COMPLETE | Must stay green: RLS/RBAC/tenant/auth/CSRF/SSRF/limits/secrets/webhooks/audit/idempotency/rate/PII/AI-policy. Any regression = release blocker. |

## 9. EXTERNAL INFRASTRUCTURE (UNCHANGED — NOT THIS BRIEF'S SCOPE TO FAKE)

Supabase project, HTTPS hosting, domain/TLS, AI providers, bridge deployment, email relay, n8n, cron host, metrics/alerting/error-tracking backends, ClamAV host, backup destination: all NOT_IMPLEMENTED_EXTERNAL — remain BLOCKED_EXTERNAL. Application work proceeds locally; nothing here claims production activation.

---

## PRIORITY QUEUE (this evolution)

**P0:** insight envelope + workforce signals · briefing engine · alert system · deterministic recruitment matching · `GET /api/candidates` · agent router + taxonomy + intelligence/recruitment agents (+3 read tools) · route-auth hardening (match/semantic) · agent eval cases · docs (AI/AGENT/RECRUITMENT/GOVERNANCE).
**P1:** command center · global search · command palette · knowledge base + grounded answers + `search_knowledge` tool · usage-intelligence hardening · bridge failover execution · notifications hardening · JD extraction (inside matching) · org onboarding.
**P2:** billing abstraction (disabled) · lifecycle workflow templates · admin polish · UX pass · user prefs.
