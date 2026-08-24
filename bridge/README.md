# Fluxentiq AI Bridge (Python)

The Python bridge is the real-time AI backend for Fluxentiq. It streams Groq
completions over SSE and executes workflow triggers, with Supabase PostgreSQL
as the canonical data store.

## Run it

```bash
pip install -r requirements.txt
uvicorn server:app --reload --port 8000     # or: python server.py
```

The Next.js app proxies `/api/ai/*` and `/api/workflows/*` to it via
`AI_BRIDGE_URL` (default `http://localhost:8000`). Start both together:

```bash
./scripts/run-e2e-local.sh ui   # boots supabase + server.py + next dev
```

## Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET  | `/health` | service + config status |
| POST | `/api/ai/evaluate-candidate` | SSE stream (match scoring) |
| POST | `/api/ai/copilot` | SSE stream (assistant + action cards) |
| POST | `/api/ai/evaluate-pto` | JSON (automated leave decision) |
| POST | `/api/workflows/trigger` | JSON (workflow execution) |

### SSE protocol

The streaming endpoints emit `data: {…}` lines terminated by a blank line:

```
data: {"type": "delta", "content": "…"}   # token deltas (streamed prose)
data: {"type": "done",  "result": {…}}    # structured result
data: [DONE]                              # terminal marker
```

`result` shapes match the typed contracts in `lib/types.ts` and the E2E mocks
in `e2e/utils/ai-mocks.ts`.

### Candidate evaluation request

```json
{ "candidate_id": "…", "candidate_name": "…", "role": "…",
  "match_score": 88, "stage": "screening", "resume_snippet": "…" }
```

Result: `{ candidate_id, candidate_name, score, summary, recommendation }`
where `recommendation ∈ {advance, hold, reject}`.

### PTO evaluation request

```json
{ "employee_id": "…", "employee_name": "…", "leave_type": "pto",
  "start_date": "…", "end_date": "…", "reason": "…",
  "balance_days": 9, "team_absences": 0 }
```

Result: `{ employee_id, decision ∈ {approve, reject, escalate}, confidence, reasoning }`.

### Workflow trigger request

```json
{ "event": "employee.created",
  "payload": { "email": "jane@fluxentiq.test", "first_name": "Jane" },
  "workflow": [
    { "id": "n1", "type": "trigger", "label": "Employee created", "config": {} },
    { "id": "n2", "type": "action", "label": "Send welcome email",
      "config": { "action": "send_email", "subject": "Welcome", "to": "jane@fluxentiq.test" } }
  ] }
```

When `workflow` is omitted, the engine loads persisted definitions from the
`workflow_nodes` table in Supabase. Supported action types: `send_email`,
`create_record`, `update_record`, `groq_evaluate`, `webhook`. Node types:
`trigger`, `action`, `condition` (config `condition: {field, op, value}`),
`delay` (config `seconds`).

## Configuration

See `.env.local` / `.env.example`:

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER` | `openai` \| `groq` \| `gemini` \| `anthropic` \| `custom` |
| `LLM_API_KEY` | the buyer's API key for the chosen provider |
| `LLM_MODEL` | optional model override (each provider has a sensible default) |
| `LLM_BASE_URL` | required for `custom` (any OpenAI-compatible endpoint) |
| `GROQ_API_KEY` / `GROQ_MODEL` | backward-compatible aliases (used when `LLM_PROVIDER=groq`) |
| `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` | enables DB-backed workflows + persistence |
| `AI_BRIDGE_PORT` | bind port, default 8000 |
| `AI_BRIDGE_CORS_ORIGINS` | comma-separated allowed origins (or `*`) |

### Bring-any-key

The bridge is **vendor-agnostic**. Point it at whichever provider (or
self-hosted endpoint) the buyer already uses:

| Provider | Transport | Default model |
|----------|-----------|---------------|
| `openai` | OpenAI-compatible | `gpt-4o-mini` |
| `groq` | OpenAI-compatible | `llama-3.3-70b-versatile` |
| `gemini` | OpenAI-compatible | `gemini-2.0-flash` |
| `anthropic` | Native Messages API | `claude-3-5-sonnet-latest` |
| `custom` | OpenAI-compatible | (set `LLM_MODEL`) |

The high-level handlers (candidate screening, PTO decisions, resume parsing,
ranking, interview reports, insights, Copilot) never change — only the
transport under `bridge/providers/` does.

## Structure

```
server.py                     FastAPI app + routes (entrypoint)
bridge/
  config.py                   env loading + settings
  models.py                   Pydantic request/response contracts
  ai_client.py                provider-agnostic AI handlers
  parsing.py                  tolerant JSON extraction
  providers/                  pluggable LLM transports
    base.py                     LLMProvider ABC
    openai_compat.py            OpenAI/Groq/Gemini/custom
    anthropic.py                Claude (native Messages API)
  supabase_client.py          async PostgREST client
  tools.py                    Copilot tool execution
  workflow_engine.py          event → workflow execution
```
