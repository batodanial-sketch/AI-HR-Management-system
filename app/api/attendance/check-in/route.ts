import { z } from 'zod'
import { clockInAction } from '@/app/actions/attendanceActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ employeeId: z.string().uuid(), workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), checkedInAt: z.string().datetime({ offset: true }).or(z.string().datetime()), source: z.string().max(80).optional(), note: z.string().max(1000).optional() })

export async function POST(request: Request) {
  try {
    const result = await clockInAction(schema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 201 : result.error.startsWith('Unauthorized') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid check-in request.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
