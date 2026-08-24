import { z } from 'zod'
import { createLeaveRequestAction, decideLeaveRequestAction } from '@/app/actions/leaveActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({ employeeId: z.string().uuid(), leaveTypeId: z.string().uuid(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), halfDay: z.boolean().optional(), reason: z.string().max(2000).optional(), attachmentKey: z.string().max(500).optional().nullable() })
const decisionSchema = z.object({ leaveRequestId: z.string().uuid(), decision: z.enum(['approved', 'rejected']), approverNote: z.string().max(1000).optional() })

export async function POST(request: Request) {
  try {
    const result = await createLeaveRequestAction(createSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 201 : result.error.startsWith('Unauthorized') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid leave request payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await decideLeaveRequestAction(decisionSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Unauthorized') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid leave decision payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
