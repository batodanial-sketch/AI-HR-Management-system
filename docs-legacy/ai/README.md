# Fluxentiq AI Reference Pack

These documents are the product contracts used by `../../fluxentiq-ai-engine.js`.

| Reference | Product use |
|---|---|
| `FLUXENTIQ_AI_MASTER_IMPLEMENTATION.md` | Governance principles, business rules, workflow roadmap, and test checklist. |
| `FLUXENTIQ_AI_PROMPT_LIBRARY.md` | Structured output contracts for resume scoring, matching, interviews, leave, payroll, performance, documents, onboarding, workflows, and copilot answers. |
| `FLUXENTIQ_AI_INTEGRATION_GUIDE.md` | UI integration patterns for each domain operation. |
| `FLUXENTIQ_AI_CHEAT_SHEET.md` | Quick reference for the complete AI package. |

## Runtime design

The current portfolio build uses a **deterministic local engine** rather than placing a provider key in the browser. It mirrors the important domain method contracts:

```text
scoreResume()
generateInterviewQuestions()
rankCandidatesForJob()
validateLeaveRequest()
validatePayroll()
generatePerformanceSummary()
generateDocument()
generateOnboardingTasks()
executeWorkflow()
answerHRQuestion()
```

Each output includes an input hash, engine version, rationale, and a persisted AI-audit record. This makes the demo repeatable, explainable, and safe to run without credentials.

## Optional secure provider mode

For a provider-backed deployment, set server-only values from `.env.example` and call the authenticated `/api/ai/anthropic` adapter. The browser must never contain the provider secret. Keep the prompt contracts above server-side, validate JSON responses against their specified structures, and retain every model decision in the audit log.
