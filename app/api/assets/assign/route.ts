import { z } from 'zod'
import { assignAssetAction, returnAssetAction } from '@/app/actions/assetActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const assignSchema = z.object({ assetId: z.string().uuid(), employeeId: z.string().uuid(), dueBackAt: z.string().datetime().optional().nullable(), assignmentCondition: z.string().max(2000).optional().nullable(), notes: z.string().max(4000).optional().nullable() })
const returnSchema = z.object({ assignmentId: z.string().uuid(), returnCondition: z.string().max(2000).optional().nullable(), notes: z.string().max(4000).optional().nullable(), outcome: z.enum(['available', 'maintenance', 'lost']).optional() })

export async function POST(request: Request) {
  try {
    const result = await assignAssetAction(assignSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 201 : result.error.startsWith('Authentication') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid asset assignment payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await returnAssetAction(returnSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Authentication') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid asset return payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
