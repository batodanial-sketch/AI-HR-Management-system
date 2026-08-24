import { z } from 'zod'
import { updateEmployeeCompensationAction, updateEmployeeDepartmentAction, updateEmployeeStatusAction } from '@/app/actions/employeeActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ id: z.string().uuid() })
const patchSchema = z.object({
  status: z.enum(['active', 'on_leave', 'probation', 'notice_period', 'terminated', 'archived']).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  annualSalary: z.number().nonnegative().optional(),
  currencyCode: z.string().length(3).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).refine(value => value.status !== undefined || value.departmentId !== undefined || value.annualSalary !== undefined, { message: 'At least one mutable employee field is required.' })

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const input = patchSchema.parse(await request.json())
    if (input.status !== undefined) {
      const result = await updateEmployeeStatusAction({ employeeId: id, status: input.status })
      if (!result.success) return Response.json(result, { status: result.error.startsWith('Unauthorized') ? 401 : 400 })
    }
    if (input.departmentId !== undefined) {
      const result = await updateEmployeeDepartmentAction({ employeeId: id, departmentId: input.departmentId })
      if (!result.success) return Response.json(result, { status: result.error.startsWith('Unauthorized') ? 401 : 400 })
    }
    if (input.annualSalary !== undefined) {
      const result = await updateEmployeeCompensationAction({ employeeId: id, annualSalary: input.annualSalary, currencyCode: input.currencyCode || 'USD', effectiveFrom: input.effectiveFrom || new Date().toISOString().slice(0, 10) })
      if (!result.success) return Response.json(result, { status: result.error.startsWith('Unauthorized') ? 401 : 400 })
      return Response.json(result)
    }
    return Response.json({ success: true, data: { employeeId: id } })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid employee update request.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
