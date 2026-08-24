# Fluxentiq AI Integration — Quick Start (< 10 min)

## Step 1: Copy the AI Module

Copy **fluxentiq-ai-module.js** and include it in your `index.html`:

```html
<script src="fluxentiq-ai-module.js"></script>
```

## Step 2: Initialize in app.js

Add this to your app initialization (after auth):

```javascript
// Initialize AI engine
const CLAUDE_API_KEY = 'your-api-key'; // Set your actual API key
window.aiEngine = new FluxentiqAI(CLAUDE_API_KEY);
```

## Step 3: Wire Resume Scoring (Resume Upload Modal)

**Find**: Your resume upload handler in `app.js`

**Replace** the mock scoring with real AI:

```javascript
async function handleResumeUpload(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const resumeText = e.target.result;
      const candidateName = prompt('Candidate full name?');
      const jobId = prompt('Job ID?');

      if (!candidateName || !jobId) return;

      // Show loading
      document.getElementById('ai-banner').innerHTML = '🔄 Analyzing resume...';

      // ✅ REAL AI CALL
      const result = await window.aiEngine.scoreResume(resumeText, jobId, app.state);

      // Display scores
      document.getElementById('analysis-result').innerHTML = `
        <div class="score-result">
          <div class="big-score">
            <span>${result.scoring.overall_score}</span>
            <small>Overall</small>
          </div>
          <div class="score-bars">
            <div class="score-bar-line">
              <label>Job Fit</label>
              <i><b style="--w: ${result.scoring.job_fit_score}%"></b></i>
              <em>${result.scoring.job_fit_score}</em>
            </div>
            <div class="score-bar-line">
              <label>Experience</label>
              <i><b style="--w: ${result.scoring.experience_score}%"></b></i>
              <em>${result.scoring.experience_score}</em>
            </div>
            <div class="score-bar-line">
              <label>Skills</label>
              <i><b style="--w: ${result.scoring.skills_score}%"></b></i>
              <em>${result.scoring.skills_score}</em>
            </div>
          </div>
        </div>
        <div class="insight-note">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 12a5 5 0 100-10 5 5 0 000 10z" fill="currentColor"/>
            <path d="M7 4h2v6H7V4zm0 6h2v2H7v-2z" fill="currentColor"/>
          </svg>
          <div>
            <strong>${result.scoring.recommendation}</strong>
            <p>${result.scoring.summary}</p>
          </div>
        </div>
        <div style="margin-top: 15px;">
          <strong>Suggested Interview Questions:</strong>
          <ol style="margin-top: 8px; font-size: 11px;">
            ${result.interview_readiness.suggested_questions.map(q => 
              `<li style="margin-bottom: 6px;"><strong>${q.question}</strong><br><small style="color: var(--muted);">${q.why}</small></li>`
            ).join('')}
          </ol>
        </div>
      `;

      // Create candidate in app state
      const candidate = {
        id: 'c_' + Date.now(),
        firstName: result.candidate.parsed_name.split(' ')[0],
        lastName: result.candidate.parsed_name.split(' ').slice(1).join(' '),
        email: result.candidate.parsed_email,
        phone: result.candidate.parsed_phone,
        location: result.candidate.location,
        skills: result.skills.required_present,
        yearsExperience: result.candidate.years_experience,
        source: 'resume_upload',
        createdAt: new Date().toISOString()
      };
      app.state.candidates.push(candidate);

      // Create application with assessment
      const application = {
        id: 'app_' + Date.now(),
        candidateId: candidate.id,
        jobId,
        stage: result.scoring.overall_score > 70 ? 'shortlisted' : 'rejected',
        appliedAt: new Date().toISOString(),
        assessment: result.scoring,
        interviewQuestions: result.interview_readiness.suggested_questions
      };
      app.state.applications.push(application);

      // Notification
      if (result.scoring.overall_score > 70) {
        app.state.notifications.push({
          id: 'n_' + Date.now(),
          title: '✨ Strong Candidate Screened',
          body: `${candidate.firstName} scored ${result.scoring.overall_score} for Job ${jobId}`,
          read: false
        });
      }

      app.saveState();
      document.getElementById('ai-banner').textContent = 'Analysis complete.';
    } catch (error) {
      document.getElementById('ai-banner').textContent = `❌ Error: ${error.message}`;
    }
  };
  reader.readAsText(file);
}
```

## Step 4: Wire Interview Questions (Recruitment Page)

**Find**: Your "Generate Interview Questions" button

**Replace** with:

```javascript
async function generateInterviewQuestionsForJob(jobId, candidateName) {
  try {
    const result = await window.aiEngine.generateInterviewQuestions(
      jobId,
      `Candidate: ${candidateName}`,
      'screening',
      app.state
    );

    document.getElementById('interview-questions-modal').innerHTML = `
      <div class="modal-head">
        <h2>Interview Kit</h2>
      </div>
      <div class="modal-body">
        <strong>Round: ${result.interview_round} (${result.duration_minutes} min)</strong>
        <ol style="margin-top: 12px;">
          ${result.questions.map((q, i) => `
            <li style="margin-bottom: 18px;">
              <strong>${q.question}</strong>
              <div style="color: var(--muted); font-size: 10px; margin-top: 4px;">
                <strong>Competency:</strong> ${q.competency}
              </div>
              <div style="color: var(--muted); font-size: 10px; margin-top: 2px;">
                <strong>Assess for:</strong> ${q.assessment_criteria}
              </div>
            </li>
          `).join('')}
        </ol>
        <div style="margin-top: 20px; padding: 12px; background: var(--surface-2); border-radius: 8px;">
          <strong>Assessment Rubric:</strong>
          <p style="margin: 6px 0 0; font-size: 10px; color: var(--muted);">
            <strong>Strong:</strong> ${result.assessment_rubric.strong}
          </p>
          <p style="margin: 4px 0 0; font-size: 10px; color: var(--muted);">
            <strong>Adequate:</strong> ${result.assessment_rubric.adequate}
          </p>
          <p style="margin: 4px 0 0; font-size: 10px; color: var(--muted);">
            <strong>Weak:</strong> ${result.assessment_rubric.weak}
          </p>
        </div>
      </div>
    `;

    // Show modal
    showModal('interview-questions-modal');
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}
```

## Step 5: Wire Leave Approval (Leave Management Page)

**Find**: Your "Approve Leave" button handler

**Replace** with:

```javascript
async function approveLeaveRequest(leaveId) {
  try {
    const leaveRequest = app.state.leaveRequests.find(lr => lr.id === leaveId);
    const employee = app.state.employees.find(e => e.id === leaveRequest.employeeId);

    if (!leaveRequest || !employee) throw new Error('Leave or employee not found');

    // ✅ VALIDATE WITH AI
    const validation = await window.aiEngine.validateLeaveRequest(
      leaveId,
      leaveRequest,
      employee,
      app.state
    );

    if (validation.recommendation === 'REJECT') {
      alert(`❌ Cannot approve: ${validation.reasoning}`);
      return;
    }

    if (validation.recommendation === 'CONDITIONAL') {
      const proceed = confirm(`⚠️ ${validation.reasoning}\n\nProceed anyway?`);
      if (!proceed) return;
    }

    // Approve
    leaveRequest.status = 'approved';
    leaveRequest.approvedAt = new Date().toISOString();

    // Update leave balance
    const leaveBalance = app.state.leaveBalances.find(
      lb => lb.employeeId === employee.id && lb.leaveType === leaveRequest.leaveType
    );
    if (leaveBalance) {
      leaveBalance.used += parseInt(leaveRequest.totalDays);
    }

    // Mark dates as on_leave in attendance
    const startDate = new Date(leaveRequest.startDate);
    const endDate = new Date(leaveRequest.endDate);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      let attendance = app.state.attendanceRecords.find(
        a => a.employeeId === employee.id && a.workDate === dateStr
      );
      if (!attendance) {
        attendance = {
          id: 'att_' + Date.now(),
          employeeId: employee.id,
          workDate: dateStr,
          status: 'on_leave',
          createdAt: new Date().toISOString()
        };
        app.state.attendanceRecords.push(attendance);
      } else {
        attendance.status = 'on_leave';
      }
    }

    // Notification
    app.state.notifications.push({
      id: 'n_' + Date.now(),
      title: '✅ Leave Approved',
      body: `${employee.name}'s leave (${leaveRequest.startDate} to ${leaveRequest.endDate}) approved`,
      read: false
    });

    app.saveState();
    alert('✅ Leave approved');
    refreshPage();
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}
```

## Step 6: Wire Performance Summary (Performance Review Modal)

**Find**: Your performance review submission handler

**Replace** with:

```javascript
async function submitPerformanceReview(employeeId, selfReview, managerReview, peerFeedback) {
  try {
    document.getElementById('performance-status').textContent = '⏳ Generating AI summary...';

    // ✅ GENERATE WITH AI
    const summary = await window.aiEngine.generatePerformanceSummary(
      employeeId,
      selfReview,
      managerReview,
      peerFeedback || 'No peer feedback provided',
      app.state
    );

    // Store review
    const review = {
      id: 'rev_' + Date.now(),
      employeeId,
      rating: summary.rating,
      summary: summary.ai_summary,
      strengths: summary.strengths,
      developmentAreas: summary.development_areas,
      recommendations: summary.recommendations,
      submittedAt: new Date().toISOString()
    };
    app.state.performanceReviews.push(review);

    // Display
    document.getElementById('performance-summary-modal').innerHTML = `
      <div class="modal-head">
        <h2>Performance Review Summary</h2>
      </div>
      <div class="modal-body">
        <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px;">
          <div class="performance-score" style="margin: 0;">
            <div class="rating-orb">
              <strong>${summary.rating.toFixed(1)}</strong>
            </div>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 14px;">${summary.rating > 3 ? '⭐ Exceeds Expectations' : summary.rating > 2 ? '👍 Meets Expectations' : '⚠️ Needs Improvement'}</h3>
            <p style="color: var(--muted); margin: 4px 0 0; font-size: 10px;">${summary.rating_justification}</p>
          </div>
        </div>

        <strong>AI Summary:</strong>
        <p style="font-size: 10px; line-height: 1.6; margin-top: 8px;">${summary.ai_summary}</p>

        <strong style="display: block; margin-top: 16px;">Strengths:</strong>
        <ul style="font-size: 10px; margin: 4px 0 0 20px;">
          ${summary.strengths.map(s => `<li>${s}</li>`).join('')}
        </ul>

        <strong style="display: block; margin-top: 12px;">Development Areas:</strong>
        <ul style="font-size: 10px; margin: 4px 0 0 20px;">
          ${summary.development_areas.map(d => `<li>${d}</li>`).join('')}
        </ul>

        <strong style="display: block; margin-top: 12px;">Recommendations:</strong>
        <p style="font-size: 10px; margin: 4px 0 0;">
          <strong>Promotion Ready:</strong> ${summary.recommendations.promotion_ready ? '✅ Yes' : '❌ No'}<br>
          <strong>Compensation:</strong> ${summary.recommendations.compensation_action}<br>
          <strong>Development Plan:</strong> ${summary.recommendations.development_plan}
        </p>
      </div>
    `;

    showModal('performance-summary-modal');
    app.saveState();
  } catch (error) {
    document.getElementById('performance-status').textContent = `Error: ${error.message}`;
  }
}
```

## Step 7: Wire Document Generation (AI Documents Page)

**Find**: Your "Generate Document" handler

**Replace** with:

```javascript
async function generateEmployeeDocument(docType, recipient) {
  try {
    document.getElementById('doc-status').textContent = '⏳ Generating document...';

    // ✅ GENERATE WITH AI
    const doc = await window.aiEngine.generateDocument(
      docType,
      recipient,
      app.state,
      {
        salary: recipient.salary,
        startDate: recipient.startDate,
        department: recipient.department,
        role: recipient.role
      }
    );

    // Store document
    const document = {
      id: 'doc_' + Date.now(),
      type: docType,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      html: doc.content_html,
      status: 'generated',
      createdAt: new Date().toISOString()
    };
    app.state.documents.push(document);

    // Display preview
    document.getElementById('document-preview').innerHTML = doc.content_html;
    document.getElementById('doc-send-btn').onclick = () => sendDocument(document.id);

    app.saveState();
    document.getElementById('doc-status').textContent = '✅ Ready to send';
  } catch (error) {
    document.getElementById('doc-status').textContent = `Error: ${error.message}`;
  }
}
```

## Step 8: Wire HR Assistant (Chatbot)

**Find**: Your chatbot message handler

**Replace** with:

```javascript
async function handleAssistantMessage(userMessage, context) {
  try {
    // Show typing
    showTypingIndicator();

    // ✅ ANSWER WITH AI
    const answer = await window.aiEngine.answerHRQuestion(
      userMessage,
      context.currentPage,
      app.state
    );

    // Display response
    displayAssistantMessage(answer.content);

    if (answer.next_actions?.length) {
      displayActionButtons(answer.next_actions);
    }

    if (answer.links?.length) {
      displayLinks(answer.links);
    }

    hideTypingIndicator();
  } catch (error) {
    displayAssistantMessage(`❌ Error: ${error.message}`);
  }
}
```

---

## Testing Checklist

- [ ] Resume upload → AI scoring → candidate created + stage auto-advanced
- [ ] Interview questions → questions generated + rubric shown
- [ ] Leave approval → validation checked + balance updated + attendance marked
- [ ] Performance review → AI summary generated + displayed
- [ ] Document generation → offer letter generated + preview shown
- [ ] HR assistant → questions answered + data pulled from context
- [ ] Audit trail → all AI actions logged with reasoning
- [ ] Error handling → invalid inputs rejected with clear messages

---

## Environment Setup

Make sure you have your Claude API key set:

```javascript
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || 'sk-ant-...';
```

Or set it directly during development:

```javascript
window.aiEngine = new FluxentiqAI('sk-ant-your-actual-key');
```

---

## That's It!

You've now wired 6 major AI operations into Fluxentiq. The system will:
- ✅ Score resumes with business logic
- ✅ Generate targeted interview questions
- ✅ Validate leave requests against policies
- ✅ Summarize performance reviews
- ✅ Generate personalized documents
- ✅ Answer HR questions with context awareness

All responses are JSON, all decisions are auditable, all data is persisted to app state.

**Next**: Test each one, then wire up the remaining operations (payroll validation, onboarding, workflow execution).
