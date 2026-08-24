export type QuizQuestionType = 'multiple_choice' | 'true_false' | 'short_answer'

export type QuizQuestion = {
  id: string
  prompt: string
  questionType: QuizQuestionType
  choices: Array<{ id: string; label: string }>
  explanation: string | null
}

export type QuizAttempt = {
  quizId: string
  enrollmentId: string
  answers: Record<string, string | string[]>
}
