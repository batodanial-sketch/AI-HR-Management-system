# Fluxentiq AI MASTER IMPLEMENTATION PROMPT
**Complete Guide for Building Enterprise HR SaaS with AI — Give This To Your Team**

---

## EXECUTIVE SUMMARY

You are building **Fluxentiq**, an enterprise AI-powered HR Management System. This is a **portfolio-quality SaaS**, not a CRUD dashboard. Every AI decision must be:
- ✅ Deterministic (same input = same output, always)
- ✅ Auditable (reasoning logged for every decision)
- ✅ Business-rules-enforced (no salary overages, leave balances respected, approval workflows honored)
- ✅ Production-ready (error handling, validation, edge cases covered)

You have **4 files** that work together. Understand them in order, implement them sequentially, and test obsessively.

---

## THE 4 FILES & WHAT THEY DO

### FILE 1: `fluxentiq-prompt-library.md`
**What it is**: The brain of the entire system. 10 domain-specific AI prompts covering every major HR workflow.

**Contains**:
1. System Prompt (inject once) — defines guardrails, tone, output format
2. Resume Parsing & Scoring — parse resume → extract skills/experience → score vs job
3. Interview Questions — generate targeted questions for screening/technical/behavioral
4. Performance Reviews — synthesize self/manager/peer feedback → AI summary
5. Documents — generate personalized offer/warning/experience/promotion letters
6. Leave Validation — check balance/policy/coverage → approve/reject/conditional
7. Payroll Validation — check for exceptions, flag discrepancies
8. Onboarding Tasks — generate checklist for new employees
9. Workflow Execution — run automation rules (trigger → action → action → log)
10. HR Chatbot — answer questions with context awareness

**How to use it**:
- Copy the **system prompt** — use the exact same one for every Claude call
- Pick the **domain prompt** relevant to your task (e.g., "Resume Parsing")
- Build the **task prompt** with user input and data from app state
- Combine all three → send to Claude API → parse JSON response
- **NEVER** deviate from the JSON schema defined in each prompt

**Red flags**:
- ❌ If Claude returns text instead of JSON, your domain prompt was unclear
- ❌ If scores are inconsistent, you didn't include the system prompt
- ❌ If Claude hallucinates data, you didn't provide sufficient context

---

### FILE 2: `fluxentiq-ai-module.js`
**What it is**: Production-ready JavaScript class. Drop it in, import it, use it.

**Contains**:
```javascript
class FluxentiqAI {
  // Constructor: takes API key, sets up system prompt
  constructor(claudeApiKey)
  
  // Core method: builds full prompt, calls Claude, parses JSON
  async call(domainPrompt, taskPrompt, context)
  
  // 8 domain methods (see below)
}
```

**The 8 Methods You'll Use**:

1. **`scoreResume(resumeText, jobId, context)`**
   - Input: Resume text, job ID
   - Output: { scoring: { overall_score, recommendation }, interview_readiness, skills }
   - Use when: Resume uploaded, need instant scoring

2. **`generateInterviewQuestions(jobId, candidateContext, round, context)`**
   - Input: Job, candidate background, round (screening/technical/behavioral)
   - Output: { questions, assessment_rubric, duration_minutes }
   - Use when: Preparing interview for candidate

3. **`generatePerformanceSummary(employeeId, selfReview, managerReview, peerFeedback, context)`**
   - Input: Reviews as text
   - Output: { rating, strengths, development_areas, ai_summary, recommendations }
   - Use when: Submitting performance review, need AI synthesis

4. **`generateDocument(docType, recipient, context, additionalData)`**
   - Input: Type (offer/warning/experience/promotion), recipient object
   - Output: { content_html, signature_block, suggested_sender }
   - Use when: Creating employment document, need personalization

5. **`validateLeaveRequest(leaveId, leaveRequest, employee, context)`**
   - Input: Leave request object, employee, company policies
   - Output: { recommendation: APPROVE|CONDITIONAL|REJECT, reasoning, balance_after }
   - Use when: Manager approving leave, need policy validation

6. **`rankCandidatesForJob(jobId, candidateIds, context)`**
   - Input: Job ID, list of candidate IDs
   - Output: { candidates_ranked: [{match_score, recommendation, why}] }
   - Use when: Showing matching candidates for a job

7. **`executeWorkflow(workflowId, triggerEvent, triggerPayload, context)`**
   - Input: Workflow definition, trigger event, event data
   - Output: { executed_steps, final_state, run_status, summary }
   - Use when: Automating multi-step processes (applicant screening, onboarding, etc.)

8. **`answerHRQuestion(question, currentContext, context)`**
   - Input: User question, current page context
   - Output: { response_type, content, next_actions, links }
   - Use when: HR chatbot needs to answer question with live data

**How to use it**:

```javascript
// 1. Initialize once
window.aiEngine = new FluxentiqAI(CLAUDE_API_KEY);

// 2. Call any method
const result = await window.aiEngine.scoreResume(resumeText, jobId, app.state);

// 3. Handle result
if (result.scoring.overall_score > 70) {
  // Auto-advance candidate
  application.stage = 'shortlisted';
} else {
  // Reject
  application.stage = 'rejected';
  application.rejectionReason = result.scoring.summary;
}

// 4. Persist to state
app.state.applications.push(application);
app.saveState();
```

**Red flags**:
- ❌ If you're not passing `context` (app.state), Claude will hallucinate data
- ❌ If you're calling the same method twice with identical inputs and getting different results, the system prompt isn't being injected
- ❌ If Claude returns an error about invalid JSON, the prompt schema is wrong

---

### FILE 3: `fluxentiq-prompt-integration-example.js`
**What it is**: Complete worked example of resume scoring, from upload to state update to audit logging.

**Shows**:
- How to read resume file from upload
- How to call `scoreResume()` with proper context
- How to parse the result
- How to create candidate + application records from result
- How to decide auto-advancement logic (score > 70 → shortlist)
- How to send notification to user
- How to save state
- How to log audit trail

**Read this first** to understand the full flow. Then copy the pattern for every other operation.

**Key pattern**:
```
1. Get user input (file, modal, confirmation)
2. Show loading state
3. Call AI method with context
4. Parse result
5. Apply business logic (auto-advance, calculate, validate)
6. Update app state (add/modify records)
7. Show notification
8. Save state
9. Refresh UI
```

**Red flags**:
- ❌ If you're not showing loading state, UI feels broken
- ❌ If you're not saving state after AI call, changes disappear on refresh
- ❌ If you're not logging to audit trail, you lose compliance/debugging info

---

### FILE 4: `QUICK_INTEGRATION_GUIDE.md`
**What it is**: Step-by-step wiring instructions. Shows exactly where in your app.js to replace mock handlers with real AI calls.

**Contains 8 concrete examples**:
1. Resume upload handler → real scoring
2. Generate interview questions → show rubric
3. Approve leave → validate + update balance
4. Submit performance review → AI summary
5. Generate offer letter → personalized HTML
6. HR assistant message → answer with context
7. (And 2 more—follow the same pattern)

**How to use it**:
- Pick ONE operation (start with Resume Scoring, it's easiest)
- Find the mock handler in your app.js
- Copy the code from the guide
- Replace the mock with real code
- Test it end-to-end
- Move to next operation

**Red flags**:
- ❌ If you wire all 8 at once, you won't know which one broke
- ❌ If you don't test each one after wiring, bugs hide
- ❌ If you skip the notification/audit logging, users don't see what happened

---

## STEP-BY-STEP IMPLEMENTATION ROADMAP

### Phase 1: Setup (15 minutes)

```bash
# 1. Get your Claude API key
# Go to https://console.anthropic.com/account/keys
# Copy your key

# 2. Add to your app.js
const CLAUDE_API_KEY = 'sk-ant-...your-key...';
window.aiEngine = new FluxentiqAI(CLAUDE_API_KEY);

# 3. Include the module in index.html
<script src="fluxentiq-ai-module.js"></script>

# 4. Verify it loads
# Open browser console → type: window.aiEngine
# Should show the FluxentiqAI class instance
```

### Phase 2: Wire Resume Scoring (20 minutes)

**Goal**: User uploads resume → AI scores → candidate auto-advanced if score > 70

**Steps**:
1. Open `app.js` → find `handleResumeUpload()` function
2. Copy code from **QUICK_INTEGRATION_GUIDE.md**, Section "Step 3: Wire Resume Scoring"
3. Replace the mock scoring (search for `// TODO: Score resume` or similar)
4. Test:
   - Upload a resume
   - See score appear in UI (0-100)
   - Check that candidate was created in app state
   - Check that application stage is "shortlisted" (if score > 70)
   - Refresh page → candidate should still exist (state persisted)
5. Check audit log → should show "resume_scored" entry

**Success criteria**:
- ✅ Score appears in UI
- ✅ Candidate created in app.state
- ✅ Application created in app.state
- ✅ Stage auto-advanced (if score > 70)
- ✅ Notification sent
- ✅ State persisted across refresh
- ✅ Audit logged

### Phase 3: Wire Leave Approval (15 minutes)

**Goal**: Manager clicks "Approve" → AI validates balance/policy/coverage → auto-updates balance + marks dates as on_leave

**Steps**:
1. Open `app.js` → find leave approval handler
2. Copy code from **QUICK_INTEGRATION_GUIDE.md**, Section "Step 5: Wire Leave Approval"
3. Replace mock with real code
4. Test:
   - Create leave request (5 days)
   - Check current balance (should show available days)
   - Approve leave
   - Check that balance decreases by 5 days
   - Check that those dates appear as "on_leave" in attendance
   - Check that notification was sent
5. Test rejection:
   - Try to approve leave with insufficient balance
   - Should reject with reason

**Success criteria**:
- ✅ Leave balance decreases
- ✅ Attendance records marked as on_leave
- ✅ Notifications sent
- ✅ Rejected if insufficient balance
- ✅ State persisted

### Phase 4: Wire Interview Questions (10 minutes)

**Goal**: Recruiter clicks "Generate Questions" → AI creates 4-5 screening questions + rubric

**Steps**:
1. Open `app.js` → find interview generation handler
2. Copy code from **QUICK_INTEGRATION_GUIDE.md**, Section "Step 4: Wire Interview Questions"
3. Replace mock
4. Test:
   - Open candidate detail → click "Generate Interview Kit"
   - See questions appear with competencies + assessment criteria
   - Check that rubric shows strong/adequate/weak definitions

**Success criteria**:
- ✅ Questions appear
- ✅ Competencies listed
- ✅ Rubric shown
- ✅ Questions differ each time (not cached)

### Phase 5: Wire Performance Summary (15 minutes)

**Goal**: Manager submits review → AI synthesizes self/manager/peer feedback → shows rating + summary + recommendations

**Steps**:
1. Open `app.js` → find performance review handler
2. Copy code from **QUICK_INTEGRATION_GUIDE.md**, Section "Step 6: Wire Performance Summary"
3. Replace mock
4. Test:
   - Open performance review modal
   - Fill in self review + manager review + peer feedback
   - Click "Generate Summary"
   - See rating (1-5) appear with AI narrative
   - Check strengths/development areas listed
   - Check promotion recommendation

**Success criteria**:
- ✅ AI summary appears
- ✅ Rating assigned (1-5)
- ✅ Strengths/development areas listed
- ✅ Recommendation for promotion (yes/no)
- ✅ Development plan suggested

### Phase 6: Wire Document Generation (10 minutes)

**Goal**: HR clicks "Generate Offer" → AI creates personalized offer letter → shows preview + send button

**Steps**:
1. Open `app.js` → find document generation handler
2. Copy code from **QUICK_INTEGRATION_GUIDE.md**, Section "Step 7: Wire Document Generation"
3. Replace mock
4. Test:
   - Select candidate
   - Choose "Offer Letter"
   - Click "Generate"
   - See personalized HTML preview
   - Check that name, role, salary, start date are filled in
   - Click "Send" → document marked as sent

**Success criteria**:
- ✅ Document preview appears
- ✅ Candidate name personalized
- ✅ Salary/role/dates filled in
- ✅ Signature block shown
- ✅ Document marked as sent

### Phase 7: Wire HR Assistant (10 minutes)

**Goal**: User types question in chatbot → AI answers with live data from context

**Steps**:
1. Open `app.js` → find chatbot message handler
2. Copy code from **QUICK_INTEGRATION_GUIDE.md**, Section "Step 8: Wire HR Assistant"
3. Replace mock
4. Test:
   - Ask: "Show me hiring pipeline"
   - Should pull recruitment funnel from app state + summarize
   - Ask: "What's Alice's leave balance?"
   - Should find Alice + show balance
   - Ask: "Generate offer for Bob"
   - Should show process to generate

**Success criteria**:
- ✅ Questions answered with real data
- ✅ No hallucinated data
- ✅ Action buttons shown when relevant
- ✅ Links to UI pages provided

### Phase 8: Full End-to-End Test (30 minutes)

**Scenario**: Recruit a new employee

1. **Recruitment page**: Upload candidate resume
   - Should score and auto-advance if > 70 ✅
   
2. **Interview scheduling**: Generate interview questions
   - Should create rubric + questions ✅
   
3. **Onboarding**: Create onboarding for hired candidate
   - Should auto-generate tasks ✅
   
4. **Documents**: Generate offer letter
   - Should create personalized HTML ✅
   
5. **Chat**: Ask chatbot "What's our hiring pipeline?"
   - Should show funnel with this new candidate ✅

---

## BUSINESS RULES TO ENFORCE

### Resume Scoring
- Score 0-100, deterministic
- Score < 40 → REJECT
- Score 40-60 → CONSIDER
- Score 60-80 → QUALIFIED
- Score > 80 → STRONG
- Always cite resume excerpts

### Leave Approval
- Reject if: balance insufficient, blackout date, no coverage
- Conditional if: team coverage is tight
- Auto-update leave balance on approval
- Auto-mark attendance as "on_leave"

### Performance Reviews
- Rating 1-2: Performance issues
- Rating 2-3: Meets expectations
- Rating 3-4: Exceeds expectations
- Rating 4-5: Promotion candidate
- Always balance strengths + development areas

### Document Generation
- Every template must have: recipient name, company name, effective date, signature block
- Offer letters: include salary, start date, benefits summary, sign-by date
- Warning letters: be specific about issue, expected changes, consequences
- Experience letters: include tenure, roles, achievements

### Leave Validation
- Reject if: used_days + requested_days > annual_allowance
- Reject if: start_date < today + notice_period
- Flag if: another team member on leave same dates
- Auto-fill balance_after_approval

### Payroll
- Gross pay <= annual_salary / 12
- All deductions checked against gross pay
- New hires have start_date before cycle
- Terminated employees not included

---

## TESTING CHECKLIST

### Resume Scoring
- [ ] Upload resume → score appears in 0-2 seconds
- [ ] Score > 70 → stage auto-set to "shortlisted"
- [ ] Score < 40 → stage auto-set to "rejected"
- [ ] Same resume scored twice → identical scores
- [ ] Questions generated + shown
- [ ] Candidate record created in app.state
- [ ] Application record created in app.state
- [ ] Audit log records action + reasoning
- [ ] Refresh page → data persists

### Leave Approval
- [ ] Sufficient balance → approve works
- [ ] Insufficient balance → reject with reason
- [ ] Approval → balance decreases
- [ ] Approval → attendance records marked on_leave
- [ ] Rejection → balance unchanged
- [ ] Notification sent on approval
- [ ] Notification sent on rejection
- [ ] Conditional approval → user warned
- [ ] Data persists after refresh

### Interview Questions
- [ ] Questions generated (4-5 for screening)
- [ ] Competencies listed for each question
- [ ] Assessment criteria shown
- [ ] Rubric shows strong/adequate/weak
- [ ] Different questions generated if generated again
- [ ] Modal displays clearly
- [ ] No errors in browser console

### Performance Summary
- [ ] AI summary generated in < 3 seconds
- [ ] Rating assigned (1-5)
- [ ] Strengths + development areas listed
- [ ] Promotion recommendation shown
- [ ] Development plan suggested
- [ ] Key quote pulled from feedback
- [ ] Same review inputs → consistent rating

### Document Generation
- [ ] Document generated in < 2 seconds
- [ ] Recipient name personalized
- [ ] Salary/role/dates filled in
- [ ] HTML renders correctly
- [ ] Print to PDF works
- [ ] Document marked as "sent" after sending
- [ ] Email template works
- [ ] Signature block shown

### HR Assistant
- [ ] Questions answered with data from app.state
- [ ] No hallucinated data
- [ ] Links to UI pages correct
- [ ] Action buttons appear when relevant
- [ ] Typing indicator shown
- [ ] Chat history persists
- [ ] No errors in console

---

## COMMON MISTAKES & HOW TO FIX

### Mistake 1: Not Passing Context
**Problem**: Claude hallucinates employee names, salary figures
```javascript
// ❌ WRONG
await window.aiEngine.scoreResume(resumeText, jobId);

// ✅ CORRECT
await window.aiEngine.scoreResume(resumeText, jobId, app.state);
```

### Mistake 2: Not Including System Prompt
**Problem**: Scores inconsistent, different format each time
```javascript
// Check that system prompt is ALWAYS injected
// In fluxentiq-ai-module.js, the constructor should include:
this.systemPrompt = `You are Fluxentiq...`;
// And every call should start with: ${this.systemPrompt}
```

### Mistake 3: Not Handling Async
**Problem**: Code runs before API returns
```javascript
// ❌ WRONG
scoreResume(resumeText, jobId, app.state);
console.log(app.state.candidates); // Empty!

// ✅ CORRECT
await scoreResume(resumeText, jobId, app.state);
console.log(app.state.candidates); // Populated!
```

### Mistake 4: Not Saving State
**Problem**: Changes disappear on refresh
```javascript
// After every AI operation:
app.saveState();
```

### Mistake 5: Not Showing Loading State
**Problem**: UI freezes, user thinks it broke
```javascript
// Before calling AI:
document.getElementById('status').textContent = '⏳ Analyzing...';

// After response:
document.getElementById('status').textContent = '✅ Complete';
```

### Mistake 6: Not Validating JSON Response
**Problem**: Claude returns markdown-wrapped JSON, parsing fails
```javascript
// In the API call, strip markdown:
let content = data.content[0].text;
const jsonMatch = content.match(/\{[\s\S]*\}/);
if (jsonMatch) content = jsonMatch[0];
const result = JSON.parse(content);
```

### Mistake 7: Not Logging Audit Trail
**Problem**: Can't trace why decision was made
```javascript
// After every AI operation:
app.state.auditLog.push({
  timestamp: new Date().toISOString(),
  action: 'resume_scored',
  entity: 'candidate',
  reasoning: result.scoring.summary,
  outcome: result.scoring
});
```

### Mistake 8: Not Handling Errors
**Problem**: Silent failures, users confused
```javascript
// Wrap all AI calls:
try {
  const result = await window.aiEngine.scoreResume(...);
} catch (error) {
  console.error('Resume scoring failed:', error);
  document.getElementById('status').textContent = `Error: ${error.message}`;
  app.state.auditLog.push({
    timestamp: new Date().toISOString(),
    action: 'resume_score_failed',
    error: error.message
  });
}
```

---

## SUCCESS CRITERIA (Final Checklist)

### By the end, you should have:

**Resume Scoring** ✅
- [ ] Resumes uploaded and scored (0-100)
- [ ] Candidates auto-created in app.state
- [ ] Applications auto-advanced (score > 70 → shortlist)
- [ ] Questions generated for each candidate
- [ ] Audit trail tracks all scoring

**Leave Management** ✅
- [ ] Leave balance decreased on approval
- [ ] Dates marked as "on_leave" in attendance
- [ ] Rejections prevented insufficient balance
- [ ] Notifications sent
- [ ] Conditional approvals flagged for review

**Interview Scheduling** ✅
- [ ] Questions generated (4-5 per round)
- [ ] Rubric shown (strong/adequate/weak)
- [ ] Interview data stored in app.state

**Performance Reviews** ✅
- [ ] Self/manager/peer feedback synthesized
- [ ] Rating assigned (1-5)
- [ ] AI narrative generated
- [ ] Promotion recommendations shown
- [ ] Development plans suggested

**Document Generation** ✅
- [ ] Offer letters personalized (name, salary, dates)
- [ ] Warning letters specific + firm
- [ ] Experience letters positive + factual
- [ ] HTML preview shown before sending

**HR Assistant** ✅
- [ ] Questions answered with live data
- [ ] No hallucinated information
- [ ] Context-aware responses
- [ ] Action buttons + links provided

**Automation** ✅
- [ ] Workflows execute step-by-step
- [ ] Audit trail records runs
- [ ] Error handling prevents silent failures

---

## QUICK REFERENCE: API METHODS

```javascript
// Initialize
window.aiEngine = new FluxentiqAI(CLAUDE_API_KEY);

// 1. Score resume
await window.aiEngine.scoreResume(resumeText, jobId, app.state)
→ { scoring: { overall_score, recommendation }, interview_readiness }

// 2. Generate interview questions
await window.aiEngine.generateInterviewQuestions(jobId, candidateContext, 'screening', app.state)
→ { interview_round, duration_minutes, questions, assessment_rubric }

// 3. Generate performance summary
await window.aiEngine.generatePerformanceSummary(employeeId, selfReview, managerReview, peerFeedback, app.state)
→ { rating, strengths, development_areas, ai_summary, recommendations }

// 4. Generate document
await window.aiEngine.generateDocument('offer_letter', recipient, app.state, { salary, startDate })
→ { content_html, signature_block, suggested_sender }

// 5. Validate leave request
await window.aiEngine.validateLeaveRequest(leaveId, leaveRequest, employee, app.state)
→ { recommendation, reasoning, balance_after_approval, checks }

// 6. Rank candidates
await window.aiEngine.rankCandidatesForJob(jobId, candidateIds, app.state)
→ { candidates_ranked: [{ match_score, recommendation, why }] }

// 7. Execute workflow
await window.aiEngine.executeWorkflow(workflowId, triggerEvent, triggerPayload, app.state)
→ { executed_steps, final_state, run_status }

// 8. Answer HR question
await window.aiEngine.answerHRQuestion(question, currentPage, app.state)
→ { response_type, content, next_actions, links }
```

---

## FINAL ADVICE

1. **Start small**: Wire ONE operation (resume scoring), test it end-to-end, then move to the next.

2. **Always include context**: Every Claude call needs `app.state` so it can pull real data.

3. **Always validate JSON**: Claude sometimes returns markdown-wrapped JSON. Strip it.

4. **Always log**: Every AI decision goes to audit trail with reasoning. This is HR—auditability is critical.

5. **Always test**: Same inputs twice should give identical outputs. If not, system prompt is broken.

6. **Always show loading**: Users hate silent waits. Show "⏳ Analyzing..." while API responds.

7. **Always handle errors**: Network fails, API errors, invalid input. Catch it all, log it, show user.

8. **Never hallucinate**: If data isn't in app.state, Claude shouldn't invent it. Check your context block.

---

## TL;DR (For When You're in a Hurry)

1. Copy `fluxentiq-ai-module.js` into your project
2. Initialize: `window.aiEngine = new FluxentiqAI(CLAUDE_API_KEY)`
3. Pick one operation from the quick guide (start with resume scoring)
4. Replace the mock handler with the real code
5. Test: upload resume → see score → see candidate auto-created
6. Move to next operation
7. Repeat until all 6+ operations are wired

**Total time**: 2-3 hours for all 6 operations if you follow the guide.

**Result**: Production-ready AI-powered HR SaaS that looks and acts like a commercial product.

---

**Questions?** Reference the prompt library (fluxentiq-prompt-library.md) for exact JSON schemas. Reference the integration guide (QUICK_INTEGRATION_GUIDE.md) for code examples. Reference the AI module (fluxentiq-ai-module.js) for method signatures.

**You've got this. Now go build it.** 🚀
