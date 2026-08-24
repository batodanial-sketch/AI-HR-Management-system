import { z } from 'zod'
import { enrollBenefitAction } from '@/app/actions/benefitsActions'
export const runtime='nodejs'; export const dynamic='force-dynamic'
const schema=z.object({planId:z.string().uuid(),employeeId:z.string().uuid(),effectiveDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),status:z.enum(['pending','enrolled','waived','cancelled']).optional(),coverage:z.record(z.string(),z.unknown()).optional()})
export async function POST(request:Request){try{const result=await enrollBenefitAction(schema.parse(await request.json()));return Response.json(result,{status:result.success?201:400})}catch(e){const error=e instanceof z.ZodError?e.issues.map(i=>i.message).join(' '):'Invalid benefit enrollment payload.';return Response.json({success:false,error},{status:400})}}