import { z } from 'zod'
import { clockOutAction } from '@/app/actions/attendanceActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ recordId: z.string().uuid(), checkedOutAt: z.string().datetime({ offset: true }).or(z.string().datetime()), workedMinutes: z.number().int().min(0).max(1440), note: z.string().max(1000).optional() })

export async function POST(request: Request) {
  try {
    const result = await clockOutAction(schema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Unauthorized') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid check-out request.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
