/* Run with: node tests/engine-smoke-test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'fluxentiq-ai-engine.js'), 'utf8'));

(async () => {
  const ai = new FluxentiqAI({ organizationName: 'Northstar Labs' });
  const context = {
    organization: {
      name: 'Northstar Labs',
      asOfDate: '2026-08-10',
      policies: { minimumNoticeDays: 3, blackoutDates: [] }
    },
    user: { id: 'e1', name: 'Olivia Carter' },
    employees: [
      { id: 'e1', name: 'Olivia Carter', title: 'HR Director', status: 'Active', annualSalary: 138000 },
      { id: 'e3', name: 'Aisha Khan', title: 'Product Designer', department: 'Product', status: 'Active', annualSalary: 102000 }
    ],
    jobs: [{ id: 'j1', title: 'Senior Frontend Engineer' }],
    candidates: [{ id: 'c1', name: 'Jane Doe', skills: ['React', 'TypeScript', 'JavaScript', 'Testing', 'Accessibility'], experience: '7 yrs experience', score: 85 }],
    leaveBalances: [{ employeeId: 'e3', type: 'Annual leave', annual: 20, used: 5, available: 15 }],
    leaveRequests: [],
    payroll: [{ name: 'Olivia Carter', gross: 11500, deductions: 2875, net: 8625 }],
    goals: [{ owner: 'Aisha Khan', title: 'Ship design system v2', progress: 82, status: 'On track' }],
    workflows: [{ id: 'w1', name: 'Smart applicant screening', actions: ['notify', 'create_task'] }],
    interviews: []
  };

  const resume = 'Jane Doe\njane@example.com\n7 years React TypeScript JavaScript Testing Accessibility GraphQL\nBachelor degree';
  const scoreA = await ai.scoreResume(resume, 'j1', context, { candidateName: 'Jane Doe' });
  const scoreB = await ai.scoreResume(resume, 'j1', context, { candidateName: 'Jane Doe' });
  const leave = await ai.validateLeaveRequest('l1', { type: 'Annual leave', from: '2026-08-17', to: '2026-08-18', days: 2 }, context.employees[1], context);
  const payroll = await ai.validatePayroll({ id: 'aug-2026' }, context.payroll, context);
  const interviewKit = await ai.generateInterviewQuestions('j1', context.candidates[0], 'screening', context);
  const workflow = await ai.executeWorkflow('w1', 'new_application', { id: 'c1' }, context);

  const results = {
    deterministicResumeScore: scoreA.scoring.overall_score === scoreB.scoring.overall_score,
    resumeScore: scoreA.scoring.overall_score,
    leaveRecommendation: leave.recommendation,
    payrollValidation: payroll.validation_status,
    interviewQuestionCount: interviewKit.questions.length,
    workflowStatus: workflow.run_status,
    auditActions: [scoreA.audit.action, leave.audit.action, payroll.audit.action, workflow.audit.action]
  };

  console.log(JSON.stringify(results, null, 2));
  if (!results.deterministicResumeScore || results.leaveRecommendation !== 'APPROVE' || results.payrollValidation !== 'APPROVED' || results.interviewQuestionCount !== 4 || results.workflowStatus !== 'succeeded') {
    process.exitCode = 1;
  }
})();
