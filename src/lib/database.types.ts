/**
 * Fluxentiq — reconciled Supabase types (single source of truth).
 *
 * This file now RE-EXPORTS the canonical `Database` type generated from
 * the live schema (lib/database.types.ts) and provides the `*Row` aliases
 * that `app/actions/*` and `src/services/*` use for return-type casts.
 *
 * The previous hand-maintained `*Row` interfaces had drifted from the live
 * columns; they are replaced by aliases to the canonical `Row` types so
 * every `.from()` / `.select()` / `.insert()` / `.update()` call is checked
 * against the real 116-table schema. (Milestone 3 / BUG-005)
 */

export * from "@/lib/database.types";
import type { Database } from "@/lib/database.types";

/** Backward-compatible scalar aliases. */
export type UUID = string;
export type Timestamp = string;

/* ── Row type aliases (canonical schema) ─────────────────────────────── */

export type AccessRevocationRecordRow = Database["public"]["Tables"]["access_revocation_records"]["Row"];
export type AiInterviewKitRow = Database["public"]["Tables"]["ai_interview_kits"]["Row"];
export type ApiKeyRow = Database["public"]["Tables"]["api_keys"]["Row"];
export type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
export type AssetAssignmentRow = Database["public"]["Tables"]["asset_assignments"]["Row"];
export type AssetRow = Database["public"]["Tables"]["assets"]["Row"];
export type AssistantConversationRow = Database["public"]["Tables"]["assistant_conversations"]["Row"];
export type AssistantMessageRow = Database["public"]["Tables"]["assistant_messages"]["Row"];
export type AttendanceEventRow = Database["public"]["Tables"]["attendance_events"]["Row"];
export type AttendancePolicyRow = Database["public"]["Tables"]["attendance_policies"]["Row"];
export type AttendanceRecordRow = Database["public"]["Tables"]["attendance_records"]["Row"];
export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
export type CandidateAiAssessmentRow = Database["public"]["Tables"]["candidate_ai_assessments"]["Row"];
export type CandidateRow = Database["public"]["Tables"]["candidates"]["Row"];
export type CertificationDefinitionRow = Database["public"]["Tables"]["certification_definitions"]["Row"];
export type CompensationPackageRow = Database["public"]["Tables"]["compensation_packages"]["Row"];
export type ComplianceAssignmentRow = Database["public"]["Tables"]["compliance_assignments"]["Row"];
export type ComplianceRequirementRow = Database["public"]["Tables"]["compliance_requirements"]["Row"];
export type DepartmentRow = Database["public"]["Tables"]["departments"]["Row"];
export type DocumentTemplateRow = Database["public"]["Tables"]["document_templates"]["Row"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type EmployeeCertificationRow = Database["public"]["Tables"]["employee_certifications"]["Row"];
export type EmployeeFileRow = Database["public"]["Tables"]["employee_files"]["Row"];
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type EmploymentHistoryRow = Database["public"]["Tables"]["employment_history"]["Row"];
export type FeedbackNoteRow = Database["public"]["Tables"]["feedback_notes"]["Row"];
export type GoalCheckInRow = Database["public"]["Tables"]["goal_check_ins"]["Row"];
export type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
export type InterviewFeedbackRow = Database["public"]["Tables"]["interview_feedback"]["Row"];
export type InterviewParticipantRow = Database["public"]["Tables"]["interview_participants"]["Row"];
export type InterviewRow = Database["public"]["Tables"]["interviews"]["Row"];
export type JobOpeningRow = Database["public"]["Tables"]["job_openings"]["Row"];
export type JobTitleRow = Database["public"]["Tables"]["job_titles"]["Row"];
export type LearningCourseRow = Database["public"]["Tables"]["learning_courses"]["Row"];
export type LearningEnrollmentRow = Database["public"]["Tables"]["learning_enrollments"]["Row"];
export type LearningLessonProgressRow = Database["public"]["Tables"]["learning_lesson_progress"]["Row"];
export type LearningLessonRow = Database["public"]["Tables"]["learning_lessons"]["Row"];
export type LearningQuizAttemptRow = Database["public"]["Tables"]["learning_quiz_attempts"]["Row"];
export type LearningQuizQuestionRow = Database["public"]["Tables"]["learning_quiz_questions"]["Row"];
export type LearningQuizRow = Database["public"]["Tables"]["learning_quizzes"]["Row"];
export type LeaveBalanceRow = Database["public"]["Tables"]["leave_balances"]["Row"];
export type LeaveRequestRow = Database["public"]["Tables"]["leave_requests"]["Row"];
export type LeaveTypeRow = Database["public"]["Tables"]["leave_types"]["Row"];
export type LocationRow = Database["public"]["Tables"]["locations"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type OffboardingCaseRow = Database["public"]["Tables"]["offboarding_cases"]["Row"];
export type OffboardingTaskRow = Database["public"]["Tables"]["offboarding_tasks"]["Row"];
export type OnboardingDocumentSigningRequestRow = Database["public"]["Tables"]["onboarding_document_signing_requests"]["Row"];
export type OnboardingEnrollmentRow = Database["public"]["Tables"]["onboarding_enrollments"]["Row"];
export type OnboardingProgramRow = Database["public"]["Tables"]["onboarding_programs"]["Row"];
export type OnboardingTaskRow = Database["public"]["Tables"]["onboarding_tasks"]["Row"];
export type OrganizationMembershipRow = Database["public"]["Tables"]["organization_memberships"]["Row"];
export type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
export type PayrollCycleRow = Database["public"]["Tables"]["payroll_cycles"]["Row"];
export type PayrollEntryRow = Database["public"]["Tables"]["payroll_entries"]["Row"];
export type PayrollLineItemRow = Database["public"]["Tables"]["payroll_line_items"]["Row"];
export type PerformanceCalibrationRecordRow = Database["public"]["Tables"]["performance_calibration_records"]["Row"];
export type PerformanceCycleRow = Database["public"]["Tables"]["performance_cycles"]["Row"];
export type PerformanceFeedbackRequestRow = Database["public"]["Tables"]["performance_feedback_requests"]["Row"];
export type PerformanceFeedbackResponseRow = Database["public"]["Tables"]["performance_feedback_responses"]["Row"];
export type PerformanceReviewAnswerRow = Database["public"]["Tables"]["performance_review_answers"]["Row"];
export type PerformanceReviewRow = Database["public"]["Tables"]["performance_reviews"]["Row"];
export type PolicyAcknowledgementRow = Database["public"]["Tables"]["policy_acknowledgements"]["Row"];
export type ReportExportRow = Database["public"]["Tables"]["report_exports"]["Row"];
export type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];
export type RoleRow = Database["public"]["Tables"]["roles"]["Row"];
export type TalentAssessmentRow = Database["public"]["Tables"]["talent_assessments"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type WorkflowRunRow = Database["public"]["Tables"]["workflow_runs"]["Row"];
export type WorkflowRow = Database["public"]["Tables"]["workflows"]["Row"];
export type SystemAuditLogRow = Database["public"]["Tables"]["system_audit_logs"]["Row"];
