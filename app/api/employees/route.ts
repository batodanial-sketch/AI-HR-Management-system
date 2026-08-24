import { z } from 'zod'
import { createEmployeeAction, getEmployeesAction } from '@/app/actions/employeeActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  employeeNumber: z.string().min(3).max(64),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  preferredName: z.string().max(120).optional().nullable(),
  workEmail: z.string().email(),
  personalEmail: z.string().email().optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  jobTitleId: z.string().uuid().optional().nullable(),
  managerId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  annualSalary: z.number().nonnegative().optional(),
  currencyCode: z.string().length(3).optional()
})

export async function GET() {
  const result = await getEmployeesAction()
  return Response.json(result, { status: result.success ? 200 : result.error.startsWith('Unauthorized') ? 401 : 500 })
}

export async function POST(request: Request) {
  try {
    const result = await createEmployeeAction(createSchema.parse(await request.json()))
    return Response.json(result, { status: result.success ? 201 : result.error.startsWith('Unauthorized') ? 401 : 400 })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid employee request.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
