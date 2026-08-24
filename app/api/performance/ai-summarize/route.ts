import { z } from 'zod'
import { generatePerformanceSummaryAction } from '@/app/actions/performanceActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ reviewId: z.string().uuid() })

export async function POST(request: Request) {
  try {
    const result = await generatePerformanceSummaryAction(schema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Authentication') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid AI performance summary payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
