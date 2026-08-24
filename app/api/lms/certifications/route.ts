import { getLMSOverviewAction } from '@/app/actions/lmsActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await getLMSOverviewAction()
  if (!result.success) return Response.json(result, { status: 400 })
  return Response.json({ success: true, data: { definitions: result.data.certifications, issued: result.data.employeeCertifications, compliance: result.data.assignments } })
}
