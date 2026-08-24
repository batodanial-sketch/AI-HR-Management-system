import { z } from 'zod'
import { calculatePayrollAction, updatePayrollCycleStatusAction } from '@/app/actions/payrollActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const calculateSchema = z.object({ cycleId: z.string().uuid() })
const statusSchema = z.object({ cycleId: z.string().uuid(), status: z.enum(['review', 'approved', 'paid', 'void']), notes: z.string().max(2000).optional() })

export async function POST(request: Request) {
  try {
    const result = await calculatePayrollAction(calculateSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Unauthorized') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid payroll calculation payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await updatePayrollCycleStatusAction(statusSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Unauthorized') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid payroll status payload.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
