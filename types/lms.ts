export type CourseStatus = 'draft' | 'published' | 'archived'
export type EnrollmentStatus = 'assigned' | 'in_progress' | 'completed' | 'overdue' | 'cancelled'

export type LearningCourse = { id: string; title: string; description: string | null; category: string | null; level: 'foundation' | 'intermediate' | 'advanced'; estimatedMinutes: number; status: CourseStatus }
export type LearningLesson = { id: string; courseId: string; title: string; contentHtml: string | null; contentUrl: string | null; durationMinutes: number; sortOrder: number; isRequired: boolean }
export type LearningEnrollment = { id: string; courseId: string; employeeId: string; dueDate: string | null; status: EnrollmentStatus; progressPercent: number }
export type Certification = { id: string; name: string; issuer: string | null; validityMonths: number | null; courseId: string | null }
export type ComplianceAssignment = { id: string; requirementId: string; employeeId: string; dueDate: string | null; status: 'assigned' | 'completed' | 'overdue' | 'waived' }
