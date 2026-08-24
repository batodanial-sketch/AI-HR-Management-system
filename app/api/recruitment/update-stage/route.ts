import { z } from 'zod'
import { updateApplicationStageAction } from '@/app/actions/recruitmentActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ applicationId: z.string().uuid(), stage: z.enum(['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']), rejectionReason: z.string().max(1000).optional().nullable() })

export async function PATCH(request: Request) {
  try {
    const result = await updateApplicationStageAction(schema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Unauthorized') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid application stage request.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
