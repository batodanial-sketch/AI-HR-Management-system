import { z } from 'zod'
import { createPerformanceCycleAction, getPerformanceOverviewAction, updatePerformanceCycleAction } from '@/app/actions/performanceActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({ name: z.string().min(2).max(180), description: z.string().max(5000).optional().nullable(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), selfReviewDueAt: z.string().datetime().optional().nullable(), managerReviewDueAt: z.string().datetime().optional().nullable(), calibrationDueAt: z.string().datetime().optional().nullable(), status: z.enum(['draft', 'active', 'calibration', 'closed', 'archived']).optional(), settings: z.record(z.string(), z.unknown()).optional() })
const patchSchema = createSchema.partial().extend({ cycleId: z.string().uuid() })

export async function GET() {
  const result = await getPerformanceOverviewAction()
  return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Authentication') ? 401 : 400 })
}

export async function POST(request: Request) {
  try {
    const result = await createPerformanceCycleAction(createSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 201 : result.error.startsWith('Authentication') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid performance cycle payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await updatePerformanceCycleAction(patchSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Authentication') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid performance cycle update payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
