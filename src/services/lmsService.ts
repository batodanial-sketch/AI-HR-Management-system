import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CertificationDefinitionRow, ComplianceAssignmentRow, ComplianceRequirementRow, Database, EmployeeCertificationRow, LearningCourseRow, LearningEnrollmentRow, LearningLessonRow, LearningQuizQuestionRow, LearningQuizRow } from '@/src/lib/supabase'

export async function getLmsWorkspace(supabase: SupabaseClient<Database>, organizationId: string) {
  const [courses, lessons, quizzes, questions, enrollments, certifications, employeeCertifications, requirements, assignments] = await Promise.all([
    supabase.from('learning_courses').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    supabase.from('learning_lessons').select('*').eq('organization_id', organizationId).order('sort_order'),
    supabase.from('learning_quizzes').select('*').eq('organization_id', organizationId),
    supabase.from('learning_quiz_questions').select('*').eq('organization_id', organizationId).order('sort_order'),
    supabase.from('learning_enrollments').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    supabase.from('certification_definitions').select('*').eq('organization_id', organizationId),
    supabase.from('employee_certifications').select('*').eq('organization_id', organizationId).order('issued_at', { ascending: false }),
    supabase.from('compliance_requirements').select('*').eq('organization_id', organizationId),
    supabase.from('compliance_assignments').select('*').eq('organization_id', organizationId).order('due_date')
  ])
  const error = courses.error || lessons.error || quizzes.error || questions.error || enrollments.error || certifications.error || employeeCertifications.error || requirements.error || assignments.error
  if (error) throw new Error(error.message)
  return { courses: (courses.data || []) as LearningCourseRow[], lessons: (lessons.data || []) as LearningLessonRow[], quizzes: (quizzes.data || []) as LearningQuizRow[], questions: (questions.data || []) as LearningQuizQuestionRow[], enrollments: (enrollments.data || []) as LearningEnrollmentRow[], certifications: (certifications.data || []) as CertificationDefinitionRow[], employeeCertifications: (employeeCertifications.data || []) as EmployeeCertificationRow[], requirements: (requirements.data || []) as ComplianceRequirementRow[], assignments: (assignments.data || []) as ComplianceAssignmentRow[] }
}
