import { z } from 'zod'
import { queueAiScreeningAction } from '@/app/actions/screeningActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ applicationId: z.string().uuid(), resumeText: z.string().min(30).max(70000), jobContext: z.record(z.string(), z.unknown()) })

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json())
    const result = await queueAiScreeningAction(input)
    return Response.json(result, { status: result.success ? 202 : result.error.startsWith('Unauthorized') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid AI screening request.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
