import { z } from 'zod'
import { createPerformanceReviewAction, getPerformanceReviewDetailAction, saveSelfAssessmentAction } from '@/app/actions/performanceActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const reviewSchema = z.object({ performanceCycleId: z.string().uuid(), employeeId: z.string().uuid(), reviewerId: z.string().uuid(), reviewType: z.string().min(2).max(80), overallRating: z.number().min(1).max(5).optional().nullable(), summary: z.string().max(12000).optional().nullable(), status: z.string().min(2).max(80).optional() })
const selfSchema = z.object({ performanceCycleId: z.string().uuid(), employeeId: z.string().uuid(), overallRating: z.number().min(1).max(5).optional().nullable(), summary: z.string().min(20).max(12000), answers: z.record(z.string(), z.unknown()).optional(), status: z.enum(['in_progress', 'submitted']).optional() })

export async function GET(request: Request) {
  const reviewId = new URL(request.url).searchParams.get('reviewId')
  if (!reviewId) return Response.json({ success: false, error: 'reviewId is required.' }, { status: 400 })
  const result = await getPerformanceReviewDetailAction({ reviewId })
  return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Authentication') ? 401 : 400 })
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>
    const result = payload.kind === 'self_assessment' ? await saveSelfAssessmentAction(selfSchema.parse(payload)) : await createPerformanceReviewAction(reviewSchema.parse(payload))
    return Response.json(result, { status: result.success ? 201 : result.error.startsWith('Authentication') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid performance review payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
