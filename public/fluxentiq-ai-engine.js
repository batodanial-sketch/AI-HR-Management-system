/*
 * Fluxentiq AI Engine
 * Deterministic, audit-first intelligence for the Fluxentiq HR workspace.
 *
 * This engine intentionally runs without a browser-exposed provider key. It applies
 * the business rules from the Fluxentiq prompt library locally and deterministically,
 * so every portfolio interaction is reproducible and auditable. A secure server-side
 * provider adapter can replace these methods later without changing UI contracts.
 */
(function attachFluxentiqAI(global) {
  'use strict';

  const VERSION = 'fluxentiq-deterministic-v1';
  const ROLE_PROFILES = [
    {
      key: 'frontend',
      match: ['frontend', 'front end', 'web engineer', 'ui engineer'],
      required: ['React', 'TypeScript', 'JavaScript', 'Testing', 'Accessibility'],
      bonus: ['Next.js', 'GraphQL', 'Design systems', 'Performance'],
      experience: 5,
      focus: 'scalable frontend systems and inclusive product experiences'
    },
    {
      key: 'designer',
      match: ['product designer', 'designer', 'ux', 'ui'],
      required: ['Figma', 'User research', 'Prototyping', 'Design systems', 'UX'],
      bonus: ['Accessibility', 'Mobile', 'Analytics', 'UX writing'],
      experience: 4,
      focus: 'customer-led product design and systems thinking'
    },
    {
      key: 'customer-success',
      match: ['customer success', 'success manager', 'client success'],
      required: ['SaaS', 'Onboarding', 'Renewals', 'Stakeholder management', 'B2B'],
      bonus: ['Salesforce', 'Gainsight', 'Expansion', 'Analytics'],
      experience: 4,
      focus: 'customer outcomes, adoption and retention'
    },
    {
      key: 'data',
      match: ['data analyst', 'analytics', 'business intelligence'],
      required: ['SQL', 'Python', 'Data visualization', 'Statistics', 'Experimentation'],
      bonus: ['Tableau', 'Looker', 'dbt', 'Machine learning'],
      experience: 3,
      focus: 'decision-quality analysis and reliable insight delivery'
    },
    {
      key: 'default',
      match: [],
      required: ['Communication', 'Collaboration', 'Problem solving', 'Ownership'],
      bonus: ['Leadership', 'Analytics', 'Project management'],
      experience: 3,
      focus: 'role outcomes, collaboration and dependable execution'
    }
  ];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  const nowIso = () => new Date().toISOString();
  const norm = value => String(value || '').toLocaleLowerCase().replace(/[^a-z0-9+#.\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
  const titleCase = value => String(value || '').replace(/[_-]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
  const unique = values => [...new Set(values.filter(Boolean))];
  const safeArray = value => Array.isArray(value) ? value : [];
  const stableHash = input => {
    const text = typeof input === 'string' ? input : JSON.stringify(input || {});
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fx_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  };
  const getProfile = title => {
    const candidate = norm(title);
    return ROLE_PROFILES.find(profile => profile.match.some(term => candidate.includes(term))) || ROLE_PROFILES[ROLE_PROFILES.length - 1];
  };
  const findById = (items, id) => safeArray(items).find(item => String(item.id) === String(id));
  const findEmployee = (context, employee) => {
    if (!employee) return null;
    const id = typeof employee === 'object' ? employee.id : employee;
    const name = typeof employee === 'object' ? employee.name : employee;
    return findById(context.employees, id) || safeArray(context.employees).find(item => norm(item.name) === norm(name)) || (typeof employee === 'object' ? employee : null);
  };
  const firstSentence = text => String(text || '').split(/[.!?]/)[0].trim();
  const includesTerm = (source, skill) => {
    const normalized = norm(source);
    const term = norm(skill);
    if (!term) return false;
    return normalized.includes(term);
  };
  const textExcerpt = (source, term) => {
    const text = String(source || '').replace(/\s+/g, ' ').trim();
    const index = norm(text).indexOf(norm(term));
    if (index < 0) return null;
    const start = Math.max(0, index - 54);
    const end = Math.min(text.length, index + String(term).length + 92);
    return text.slice(start, end).trim();
  };
  const parseYears = text => {
    const matches = [...String(text || '').matchAll(/\b(\d{1,2})(?:\s*\+)?\s*(?:years?|yrs?)\b/gi)].map(match => Number(match[1]));
    if (!matches.length) return 0;
    return clamp(Math.max(...matches), 0, 30);
  };
  const parseEmail = text => (String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
  const parsePhone = text => (String(text || '').match(/(?:\+?\d[\d\s().-]{7,}\d)/) || [])[0] || '';
  const parseCandidateName = (resumeText, fallback) => {
    const lines = String(resumeText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const nameLine = lines.find(line => /^[A-Za-z][A-Za-z'’-]+(?:\s+[A-Za-z][A-Za-z'’-]+){1,2}$/.test(line));
    return nameLine || fallback || 'Candidate not identified';
  };
  const scoreBand = score => score > 80 ? 'STRONG' : score >= 60 ? 'QUALIFIED' : score >= 40 ? 'CONSIDER' : 'REJECT';
  const daysBetween = (start, end) => {
    const ms = new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`);
    return Math.max(1, Math.round(ms / 86400000) + 1);
  };
  const formatDate = iso => {
    try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`)); } catch { return iso; }
  };

  class FluxentiqAI {
    constructor(options = {}) {
      this.options = { organizationName: options.organizationName || 'Northstar Labs', timezone: options.timezone || 'UTC', ...options };
      this.systemPrompt = 'Fluxentiq AI is deterministic, auditable, context-bound and policy-aware. It never invents HR records that are absent from context.';
      this.version = VERSION;
    }

    audit(action, input, reasoning, outcome = {}) {
      return {
        id: `${action}_${stableHash({ input, reasoning, outcome })}`,
        timestamp: nowIso(),
        action,
        engine: VERSION,
        input_hash: stableHash(input),
        reasoning: Array.isArray(reasoning) ? reasoning : [String(reasoning || '')],
        outcome
      };
    }

    async scoreResume(resumeText, jobId, context = {}, options = {}) {
      const job = findById(context.jobs, jobId) || { id: jobId, title: options.jobTitle || 'Open role' };
      const profile = getProfile(job.title);
      const source = String(resumeText || '');
      const requiredPresent = profile.required.filter(skill => includesTerm(source, skill));
      const bonusPresent = profile.bonus.filter(skill => includesTerm(source, skill));
      const missingRequired = profile.required.filter(skill => !requiredPresent.includes(skill));
      const years = parseYears(source);
      const education = /\b(ph\.?d|doctorate)\b/i.test(source) ? 'Doctorate' : /\b(master|mba|m\.s\.|m\.sc)\b/i.test(source) ? 'Master’s degree' : /\b(bachelor|b\.s\.|b\.a\.|bsc)\b/i.test(source) ? 'Bachelor’s degree' : 'Not stated';
      const skillsScore = clamp(Math.round((requiredPresent.length / profile.required.length) * 82 + (bonusPresent.length / Math.max(1, profile.bonus.length)) * 18), 0, 100);
      const experienceScore = clamp(Math.round(35 + Math.min(years, profile.experience + 4) / (profile.experience + 4) * 65), 0, 100);
      const educationScore = education === 'Doctorate' ? 96 : education === 'Master’s degree' ? 90 : education === 'Bachelor’s degree' ? 80 : 58;
      const jobFitScore = clamp(Math.round(skillsScore * .68 + experienceScore * .22 + Math.min(100, 55 + bonusPresent.length * 11) * .10), 0, 100);
      const overall = clamp(Math.round(jobFitScore * .40 + experienceScore * .30 + skillsScore * .20 + educationScore * .10), 0, 100);
      const recommendation = scoreBand(overall);
      const cited = requiredPresent.slice(0, 3).map(skill => ({ skill, excerpt: textExcerpt(source, skill) || `Resume contains ${skill}.` }));
      const candidateName = parseCandidateName(source, options.candidateName);
      const concerns = [
        ...(years < profile.experience ? [`Resume evidences ${years || 'no stated'} years against a ${profile.experience}-year baseline.`] : []),
        ...(missingRequired.length ? [`Validate ${missingRequired.slice(0, 2).join(' and ')} during interview.`] : [])
      ];
      const response = {
        candidate: {
          parsed_name: candidateName,
          parsed_email: parseEmail(source),
          parsed_phone: parsePhone(source),
          location: /\b(remote|hybrid|new york|london|san francisco|karachi|lahore|dubai)\b/i.exec(source)?.[0] || 'Not stated',
          current_role: job.title,
          years_experience: years,
          education: { degree: education, field: 'Not reliably stated', institution: 'Not reliably stated' }
        },
        skills: {
          required_present: requiredPresent,
          bonus_skills: bonusPresent,
          missing_required: missingRequired,
          level_assessment: years >= profile.experience + 2 ? 'Senior' : years >= profile.experience ? 'Established' : 'Emerging'
        },
        experience_analysis: {
          roles: years ? [{ title: job.title, company: 'Not reliably stated', years, achievements: cited.map(item => item.excerpt), relevance_to_job: `Evidence aligns to ${profile.focus}.` }] : [],
          domain_depth: requiredPresent.length >= Math.ceil(profile.required.length * .6) ? 'Strong' : 'Emerging',
          employment_gaps: []
        },
        scoring: {
          job_fit_score: jobFitScore,
          experience_score: experienceScore,
          skills_score: skillsScore,
          education_score: educationScore,
          overall_score: overall,
          recommendation,
          summary: `${candidateName} is a ${recommendation.toLowerCase()} match for ${job.title}. ${requiredPresent.length ? `Verified evidence includes ${requiredPresent.slice(0, 3).join(', ')}.` : 'The uploaded text has limited role-specific evidence.'} ${concerns[0] || 'Experience and skill evidence meet the stated baseline.'}`
        },
        interview_readiness: {
          suggested_questions: this._questionsFor(profile, requiredPresent, 'screening').slice(0, 4).map(question => ({ question: question.question, why: question.competency })),
          talking_points: requiredPresent.length ? requiredPresent.slice(0, 3) : ['Clarify scope of recent work', 'Validate role-specific capability'],
          potential_concerns: concerns,
          citations: cited
        }
      };
      response.audit = this.audit('resume_scored', { jobId, source, candidateName }, [
        `Required skills present: ${requiredPresent.length}/${profile.required.length}.`,
        `Stated experience: ${years || 0} years; baseline: ${profile.experience} years.`,
        `Weighted score: ${overall} (${recommendation}).`
      ], response.scoring);
      return response;
    }

    _questionsFor(profile, skills, round) {
      const skill = skills[0] || profile.required[0];
      const second = skills[1] || profile.required[1] || 'collaboration';
      const questions = [
        { id: 'q1', question: `Walk us through a recent outcome where you used ${skill}. What was your decision process and measurable result?`, competency: `${skill} depth and impact`, type: 'open-ended', assessment_criteria: 'Strong answers name scope, trade-offs, evidence and ownership.', follow_up: 'What would you change if you repeated the work?' },
        { id: 'q2', question: `Describe a time a stakeholder challenged your approach to ${second}. How did you reach alignment?`, competency: 'Stakeholder communication', type: 'behavioral', assessment_criteria: 'Strong answers show active listening, clear rationale and a shared outcome.', follow_up: 'How did you know the alignment held?' },
        { id: 'q3', question: `What signals tell you that your work is creating value in ${profile.focus}?`, competency: 'Outcome orientation', type: 'scenario', assessment_criteria: 'Strong answers connect decisions to customer, team or business measures.', follow_up: 'Which signal would you monitor first?' },
        { id: 'q4', question: `Tell us about feedback that materially changed your work. What did you do next?`, competency: 'Learning agility', type: 'behavioral', assessment_criteria: 'Strong answers demonstrate reflection, action and a specific improvement.', follow_up: 'Who helped you apply that learning?' },
        { id: 'q5', question: `How would you approach your first 30 days in a role focused on ${profile.focus}?`, competency: 'Role readiness', type: 'scenario', assessment_criteria: 'Strong answers prioritize discovery, relationships, context and early measurable value.', follow_up: 'What would you avoid changing too early?' }
      ];
      return round === 'technical' ? questions.slice(0, 5) : questions.slice(0, 4);
    }

    async generateInterviewQuestions(jobId, candidateContext, round = 'screening', context = {}) {
      const job = findById(context.jobs, jobId) || { id: jobId, title: 'Open role' };
      const candidate = typeof candidateContext === 'object' ? candidateContext : safeArray(context.candidates).find(item => norm(item.name) === norm(candidateContext)) || {};
      const profile = getProfile(job.title);
      const skills = safeArray(candidate.skills);
      const questions = this._questionsFor(profile, skills, round);
      const duration = round === 'technical' ? 55 : round === 'behavioral' ? 40 : 30;
      const response = {
        interview_round: round,
        duration_minutes: duration,
        questions: questions.map((question, index) => ({ ...question, id: `${round}_${index + 1}` })),
        assessment_rubric: {
          strong: `Connects specific ${profile.focus} examples to scope, trade-offs and verifiable outcomes.`,
          adequate: 'Provides a relevant example but needs prompting for ownership, evidence or learning.',
          weak: 'Stays hypothetical, cannot explain personal contribution, or avoids role-relevant detail.'
        },
        time_allocation: Object.fromEntries(questions.map((question, index) => [`${round}_${index + 1}`, Math.max(5, Math.floor(duration / questions.length))]))
      };
      response.audit = this.audit('interview_kit_generated', { jobId, candidateId: candidate.id || candidateContext, round }, [
        `Round: ${round}.`, `Role profile: ${profile.key}.`, `Candidate skills used: ${skills.join(', ') || 'none stated'}.`
      ], { question_count: questions.length, duration_minutes: duration });
      return response;
    }

    async rankCandidatesForJob(jobId, candidateIds, context = {}) {
      const job = findById(context.jobs, jobId) || { id: jobId, title: 'Open role' };
      const profile = getProfile(job.title);
      const candidates = safeArray(candidateIds).map(id => typeof id === 'object' ? id : findById(context.candidates, id)).filter(Boolean);
      const ranked = candidates.map(candidate => {
        const skills = safeArray(candidate.skills);
        const matched = profile.required.filter(skill => skills.some(value => norm(value).includes(norm(skill)) || norm(skill).includes(norm(value))));
        const skillScore = Math.round((matched.length / profile.required.length) * 100);
        const years = Number(String(candidate.experience || candidate.yearsExperience || '').match(/\d+/)?.[0] || 0);
        const experienceScore = clamp(Math.round(45 + Math.min(years, profile.experience + 4) / (profile.experience + 4) * 55), 0, 100);
        const score = clamp(Math.round(skillScore * .62 + experienceScore * .28 + (candidate.score || 65) * .10), 0, 100);
        return {
          candidate_id: candidate.id,
          candidate_name: candidate.name,
          match_score: score,
          fit_breakdown: { required_skills_match: skillScore, experience_fit: experienceScore, salary_alignment: 'not_provided', culture_indicators: 'Not inferred without structured evidence.' },
          recommendation: score >= 82 ? 'STRONG_MATCH' : score >= 65 ? 'GOOD_MATCH' : score >= 45 ? 'CONSIDER' : 'NOT_RECOMMENDED',
          why: `${matched.length}/${profile.required.length} role requirements are represented in the candidate profile.`,
          next_step: score >= 65 ? 'Schedule screening call' : 'Request role-relevant evidence'
        };
      }).sort((a, b) => b.match_score - a.match_score);
      const response = { job_id: job.id, job_title: job.title, candidates_ranked: ranked, summary: `${ranked.filter(item => item.recommendation === 'STRONG_MATCH').length} strong and ${ranked.filter(item => item.recommendation === 'GOOD_MATCH').length} good matches across ${ranked.length} candidates.` };
      response.audit = this.audit('candidates_ranked', { jobId, candidateIds }, [`Role profile: ${profile.key}.`, 'Ranking uses disclosed skills, experience and existing assessment score only.'], { count: ranked.length });
      return response;
    }

    async validateLeaveRequest(leaveId, leaveRequest, employee, context = {}) {
      const person = findEmployee(context, employee) || employee || {};
      const request = leaveRequest || {};
      const requestedDays = Number(request.days || request.totalDays || daysBetween(request.from || request.start_date, request.to || request.end_date));
      const type = request.type || request.leaveType || 'Annual leave';
      const balance = safeArray(context.leaveBalances).find(item => String(item.employeeId || item.employee_id) === String(person.id) && norm(item.type || item.leaveType) === norm(type));
      const annual = Number(balance?.annual || balance?.annualAllowance || 20);
      const used = Number(balance?.used || balance?.usedDays || 0);
      const remaining = Number(balance?.available ?? balance?.remaining ?? Math.max(0, annual - used));
      const start = request.from || request.startDate || request.start_date;
      const end = request.to || request.endDate || request.end_date;
      const conflicts = safeArray(context.leaveRequests).filter(item => item.id !== leaveId && item.status === 'Approved' && item.name !== person.name && item.from <= end && item.to >= start);
      const asOfDate = context.organization?.asOfDate || new Date().toISOString().slice(0, 10);
      const policy = context.organization?.policies || {};
      const minimumNoticeDays = Number(policy.minimumNoticeDays || 0);
      const noticeDays = start ? Math.round((new Date(`${start}T12:00:00`) - new Date(`${asOfDate}T12:00:00`)) / 86400000) : -1;
      const blackoutHit = safeArray(policy.blackoutDates).some(date => date >= start && date <= end);
      const noticePeriodMet = noticeDays >= minimumNoticeDays;
      const balanceSufficient = requestedDays <= remaining;
      const policyCompliant = Boolean(start && end && end >= start && !blackoutHit && noticePeriodMet);
      const coverageAvailable = conflicts.length < 2;
      const recommendation = !balanceSufficient || !policyCompliant ? 'REJECT' : !coverageAvailable ? 'CONDITIONAL' : 'APPROVE';
      const conditions = recommendation === 'CONDITIONAL' ? ['Confirm coverage with the manager before finalizing this request.'] : [];
      const response = {
        leave_request_id: leaveId,
        employee_id: person.id || null,
        recommendation,
        reasoning: !balanceSufficient ? `${person.name || 'Employee'} has ${remaining} days available and requested ${requestedDays}.` : blackoutHit ? 'The requested dates overlap a company blackout period.' : !noticePeriodMet ? `The request provides ${noticeDays} days of notice; policy requires ${minimumNoticeDays}.` : !policyCompliant ? 'The date range is incomplete or invalid.' : !coverageAvailable ? `${conflicts.length} team leave conflict(s) overlap the requested dates.` : `Balance, dates, notice and current team coverage pass the defined policy checks.`,
        checks: { balance_sufficient: balanceSufficient, policy_compliant: policyCompliant, coverage_available: coverageAvailable, notice_period_met: noticePeriodMet },
        balance_after_approval: { used_days: used + requestedDays, remaining_days: Math.max(0, remaining - requestedDays), year: 2026 },
        coverage_impact: conflicts.length ? `Overlap: ${conflicts.map(item => item.name).join(', ')}.` : 'No coverage issues detected.',
        conditions
      };
      response.audit = this.audit('leave_validated', { leaveId, request, employee: person.id }, [response.reasoning, `Recommendation: ${recommendation}.`], response.checks);
      return response;
    }

    async validatePayroll(cycle, entries, context = {}) {
      const payrollEntries = safeArray(entries);
      const exceptions = [];
      payrollEntries.forEach(entry => {
        const employee = safeArray(context.employees).find(item => item.name === entry.name || item.id === entry.employeeId);
        const gross = Number(entry.gross || entry.grossPay || 0);
        const deductions = Number(entry.deductions || entry.totalDeductions || 0);
        if (deductions > gross) exceptions.push({ severity: 'error', employee: entry.name, issue: 'Deductions exceed gross pay', detail: `${deductions} exceeds ${gross}.`, recommended_action: 'Correct deductions before approval.' });
        if (Number(employee?.annualSalary) > 0 && gross > Number(employee.annualSalary) / 12) exceptions.push({ severity: 'error', employee: entry.name, issue: 'Gross exceeds approved monthly salary', detail: `${gross} exceeds the ${Number(employee.annualSalary) / 12} monthly salary ceiling.`, recommended_action: 'Validate approved compensation change or correct gross pay.' });
        if (employee?.status === 'Terminated') exceptions.push({ severity: 'error', employee: entry.name, issue: 'Terminated employee included', detail: 'Employment status is terminated.', recommended_action: 'Remove from this payroll cycle.' });
        if (gross <= 0) exceptions.push({ severity: 'warning', employee: entry.name, issue: 'Non-positive gross pay', detail: 'Gross pay is zero or negative.', recommended_action: 'Confirm unpaid leave or correct payroll input.' });
      });
      const response = {
        payroll_cycle_id: cycle?.id || 'current-cycle',
        period: { start: cycle?.start || '2026-08-01', end: cycle?.end || '2026-08-31' },
        validation_status: exceptions.some(item => item.severity === 'error') ? 'BLOCKED' : exceptions.length ? 'EXCEPTIONS' : 'APPROVED',
        total_gross: payrollEntries.reduce((sum, entry) => sum + Number(entry.gross || 0), 0),
        total_net: payrollEntries.reduce((sum, entry) => sum + Number(entry.net || entry.netPay || 0), 0),
        employee_count: payrollEntries.length,
        exceptions,
        audit_notes: exceptions.length ? 'Review all flagged entries before approving payroll.' : 'All deterministic payroll checks passed.'
      };
      response.audit = this.audit('payroll_validated', { cycle, entryCount: payrollEntries.length }, [response.audit_notes], { status: response.validation_status, exceptions: exceptions.length });
      return response;
    }

    async generatePerformanceSummary(employeeId, selfReview, managerReview, peerFeedback, context = {}) {
      const employee = findEmployee(context, employeeId) || { id: employeeId, name: 'Employee', title: 'Role' };
      const input = `${selfReview || ''}\n${managerReview || ''}\n${safeArray(peerFeedback).join('\n')}`;
      const positive = (norm(input).match(/\b(exceeded|impact|leadership|strong|excellent|improved|delivered|ownership)\b/g) || []).length;
      const growth = (norm(input).match(/\b(develop|improve|risk|gap|support|challenge|focus)\b/g) || []).length;
      const goals = safeArray(context.goals).filter(goal => goal.owner === employee.name);
      const goalProgress = goals.length ? goals.reduce((sum, goal) => sum + Number(goal.progress || 0), 0) / goals.length : 70;
      const rating = clamp(Math.round((2.8 + positive * .16 - growth * .04 + (goalProgress - 60) / 100) * 10) / 10, 1, 5);
      const strengths = unique([
        ...(positive ? ['Consistent ownership and collaboration'] : []),
        ...(goalProgress >= 70 ? ['Meaningful progress toward committed goals'] : []),
        'Role-relevant execution evidence'
      ]).slice(0, 3);
      const development = unique([
        ...(growth ? ['Turn feedback themes into a time-bound development plan'] : []),
        ...(goalProgress < 70 ? ['Create a recovery plan for at-risk goals'] : []),
        'Continue documenting measurable outcomes'
      ]).slice(0, 3);
      const response = {
        employee_id: employee.id,
        period: { start: '2026-07-01', end: '2026-09-30' },
        rating,
        rating_justification: `Rating is grounded in ${positive} positive evidence signals, ${growth} growth signals and ${Math.round(goalProgress)}% average goal progress.`,
        strengths,
        development_areas: development,
        goal_achievement: { achieved: goals.filter(goal => Number(goal.progress) >= 85).map(goal => ({ goal: goal.title, result: `${goal.progress}% progress` })), partial: goals.filter(goal => Number(goal.progress) >= 45 && Number(goal.progress) < 85).map(goal => ({ goal: goal.title, result: `${goal.progress}% progress`, blockers: [] })), not_achieved: goals.filter(goal => Number(goal.progress) < 45).map(goal => ({ goal: goal.title, reason: 'Progress is below the current recovery threshold.' })) },
        recommendations: { promotion_ready: rating >= 4.3, development_plan: `Agree two measurable growth outcomes with ${employee.manager || 'the manager'} and revisit them at the next monthly check-in.`, compensation_action: rating >= 4.3 ? 'review' : 'maintain' },
        ai_summary: `${employee.name} is tracking at ${rating.toFixed(1)}/5 for the current cycle. ${strengths.join('; ')}. The next focus should be ${development[0].toLowerCase()}.`,
        key_quote: firstSentence(managerReview) || firstSentence(selfReview) || 'No narrative feedback was provided.'
      };
      response.audit = this.audit('performance_summary_generated', { employeeId, selfReview, managerReview, peerFeedback }, [response.rating_justification], { rating });
      return response;
    }

    async generateDocument(docType, recipient, context = {}, additional = {}) {
      const person = recipient || {};
      const company = context.organization?.name || this.options.organizationName;
      const role = additional.role || person.title || 'the role';
      const date = additional.effectiveDate || additional.startDate || 'August 10, 2026';
      const salary = additional.salary || person.salary || 'as discussed';
      const safePerson = escapeHtml(person.name || 'Employee');
      const safeRole = escapeHtml(role);
      const safeCompany = escapeHtml(company);
      const safeDate = escapeHtml(date);
      const safeSalary = escapeHtml(salary);
      const type = String(docType || 'offer_letter').replace(/\s+/g, '_').toLowerCase();
      const templates = {
        offer_letter: { title: 'Offer of Employment', body: `<p>Dear <strong>${safePerson}</strong>,</p><p>We are pleased to offer you the position of <strong>${safeRole}</strong> with ${safeCompany}, effective ${safeDate}. Your proposed compensation is <strong>${safeSalary}</strong>, subject to the terms in the accompanying agreement.</p><p>We were impressed by your experience and look forward to the impact you will make with the team.</p>` },
        warning_letter: { title: 'Formal Warning Notice', body: `<p>Dear <strong>${safePerson}</strong>,</p><p>This letter documents the expectations discussed with you. Please address the identified concern, demonstrate the required improvement and meet with your manager on the agreed review date.</p><p>We will provide appropriate support and assess progress against these clear expectations.</p>` },
        experience_letter: { title: 'Employment Experience Letter', body: `<p>To whom it may concern,</p><p>This is to confirm that <strong>${safePerson}</strong> has worked with ${safeCompany} in the role of <strong>${safeRole}</strong>. Their employment record and contributions are acknowledged with appreciation.</p>` },
        promotion_letter: { title: 'Promotion Confirmation', body: `<p>Dear <strong>${safePerson}</strong>,</p><p>We are delighted to confirm your promotion to <strong>${safeRole}</strong>, effective ${safeDate}. This recognizes your contribution, growth and trusted impact across the team.</p>` }
      };
      const template = templates[type] || templates.offer_letter;
      const response = { document_type: type, title: template.title, recipient: { name: person.name || 'Recipient', email: person.email || '', address: '' }, content_html: template.body, placeholders_filled: { company, role, date, salary }, signature_block: `People & Culture · ${company}`, legal_notices: 'Review the final document against local employment law and company policy before sending.', suggested_sender: context.user?.name || 'HR Director' };
      response.audit = this.audit('document_generated', { type, recipient: person.id || person.name, additional }, [`Generated ${type} with context-bound placeholders.`], { title: response.title });
      return response;
    }

    async generateOnboardingTasks(employee, context = {}) {
      const person = findEmployee(context, employee) || employee || {};
      const start = person.startDate || person.joined || '2026-08-10';
      const tasks = [
        ['prehire', 'Confirm contract and policy acknowledgements', 'People team', 0, 'critical'],
        ['day1', 'Provision role-specific accounts and access', 'IT & Security', 0, 'critical'],
        ['day1', 'Welcome and team orientation', person.manager || 'Hiring manager', 0, 'high'],
        ['week1', 'Introduce onboarding buddy and key partners', person.manager || 'Hiring manager', 4, 'high'],
        ['week1', 'Align 30-day role outcomes', person.manager || 'Hiring manager', 5, 'high'],
        ['month1', 'Conduct first-month growth check-in', 'People team', 28, 'medium']
      ].map(([category, title, owner, offset, priority], index) => ({ id: `onboarding_${index + 1}`, title, description: `${title} for ${person.name || 'the new employee'} in ${person.department || 'their department'}.`, owner, due_date: new Date(new Date(`${start}T12:00:00`).getTime() + offset * 86400000).toISOString().slice(0, 10), category, priority }));
      const response = { enrollment_id: `enr_${stableHash({ employee: person.id || person.name, start })}`, employee_id: person.id || null, start_date: start, target_completion_date: new Date(new Date(`${start}T12:00:00`).getTime() + 30 * 86400000).toISOString().slice(0, 10), tasks, milestones: [{ date: start, milestone: 'Day 1 ready' }, { date: tasks[4].due_date, milestone: '30-day goals aligned' }, { date: tasks[5].due_date, milestone: 'First-month check-in' }] };
      response.audit = this.audit('onboarding_generated', { employee: person.id || person.name }, [`Generated ${tasks.length} role-aware onboarding tasks.`], { task_count: tasks.length });
      return response;
    }

    async executeWorkflow(workflow, triggerEvent, triggerPayload, context = {}) {
      const definition = typeof workflow === 'object' ? workflow : findById(context.workflows, workflow) || { id: workflow, name: 'Workflow', actions: [] };
      const actions = safeArray(definition.actions).length ? definition.actions : ['notify', 'create_task'];
      const executed = actions.map((action, index) => ({ step_id: `${definition.id || 'workflow'}_${index + 1}`, action: typeof action === 'string' ? action : action.type || 'notify', status: 'completed', result: { trigger: triggerEvent, entity: triggerPayload?.id || triggerPayload?.name || 'workspace' }, error: null }));
      const response = { workflow_id: definition.id, run_id: `run_${stableHash({ workflow: definition.id, triggerEvent, triggerPayload })}`, trigger_event: triggerEvent, executed_steps: executed, final_state: { notified: true }, run_status: 'succeeded', summary: `${definition.name || 'Workflow'} completed ${executed.length} deterministic step${executed.length === 1 ? '' : 's'}.` };
      response.audit = this.audit('workflow_executed', { workflow: definition.id, triggerEvent, triggerPayload }, [response.summary], { run_status: response.run_status });
      return response;
    }

    async answerHRQuestion(question, currentContext, context = {}) {
      const text = norm(question);
      const candidates = safeArray(context.candidates);
      const leaves = safeArray(context.leaveRequests);
      const interviews = safeArray(context.interviews);
      const jobs = safeArray(context.jobs);
      let response;
      if (/hiring|recruit|pipeline|candidate/.test(text)) {
        const counts = ['Applied', 'Screening', 'Shortlisted', 'Interview', 'Offer'].map(stage => `${stage}: ${candidates.filter(candidate => candidate.stage === stage).length}`).join(' · ');
        const top = [...candidates].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
        response = { response_type: 'data', content: `Hiring pipeline — ${counts}. ${top ? `Top current match: ${top.name} at ${top.score}% for ${top.title}.` : 'No candidate records are available.'}`, next_actions: ['Open recruitment pipeline', 'Review AI screening queue'], related_links: ['recruitment', 'screening'] };
      } else if (/leave|time off|approval|coverage/.test(text)) {
        const pending = leaves.filter(leave => leave.status === 'Pending');
        response = { response_type: 'data', content: `${pending.length} leave request${pending.length === 1 ? '' : 's'} need attention: ${pending.map(leave => `${leave.name} (${leave.days}d)`).join(', ') || 'none'}.`, next_actions: ['Review approval inbox', 'Check team coverage'], related_links: ['leave'] };
      } else if (/interview|schedule/.test(text)) {
        const scheduled = interviews.filter(interview => interview.status === 'Scheduled').slice(0, 3);
        response = { response_type: 'data', content: scheduled.length ? `Upcoming interviews: ${scheduled.map(interview => `${interview.candidate} on ${formatDate(interview.date)} at ${interview.time}`).join('; ')}.` : 'No scheduled interviews are in the workspace.', next_actions: ['Open recruitment calendar'], related_links: ['recruitment'] };
      } else if (/payroll|salary|pay/.test(text)) {
        const payroll = safeArray(context.payroll);
        const total = payroll.reduce((sum, entry) => sum + Number(entry.net || 0), 0);
        response = { response_type: 'data', content: `Current payroll contains ${payroll.length} visible entries with ${total.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} in estimated net pay.`, next_actions: ['Open payroll review'], related_links: ['payroll'] };
      } else if (/performance|goal|review/.test(text)) {
        const goals = safeArray(context.goals);
        const average = goals.length ? Math.round(goals.reduce((sum, goal) => sum + Number(goal.progress || 0), 0) / goals.length) : 0;
        response = { response_type: 'data', content: `${goals.length} active goals are averaging ${average}% progress. ${goals.filter(goal => goal.status === 'At risk').length} goal(s) are currently marked at risk.`, next_actions: ['Open performance workspace', 'Generate team summary'], related_links: ['performance'] };
      } else {
        response = { response_type: 'text', content: 'I can provide a context-bound update on people, hiring, leave, payroll, performance, interviews or documents. I will only use records currently available in this workspace.', next_actions: ['Show hiring pipeline', 'Review leave approvals', 'Generate a performance brief'], related_links: ['dashboard'] };
      }
      response.timestamp = nowIso();
      response.audit = this.audit('assistant_answered', { question, currentContext }, [`Response was constrained to ${currentContext || 'workspace'} data.`], { response_type: response.response_type });
      return response;
    }
  }

  global.FluxentiqAI = FluxentiqAI;
  global.FluxentiqAI_VERSION = VERSION;
})(window);
