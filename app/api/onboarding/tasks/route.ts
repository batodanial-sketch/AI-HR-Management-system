import { z } from 'zod'
import { getOnboardingOverviewAction, updateOnboardingTaskAction } from '@/app/actions/onboardingActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const updateSchema = z.object({ taskId: z.string().uuid(), status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'skipped']), note: z.string().max(2000).optional().nullable() })

export async function GET() {
  const result = await getOnboardingOverviewAction()
  return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Authentication') ? 401 : 400 })
}

export async function PATCH(request: Request) {
  try {
    const result = await updateOnboardingTaskAction(updateSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Authentication') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid onboarding task payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
