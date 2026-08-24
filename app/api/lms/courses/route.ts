import { z } from 'zod'
import { createCourseAction, getLMSOverviewAction } from '@/app/actions/lmsActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const schema = z.object({ title: z.string().min(2).max(240), description: z.string().max(12000).optional().nullable(), category: z.string().max(120).optional().nullable(), level: z.enum(['foundation','intermediate','advanced']).optional(), estimatedMinutes: z.number().int().min(1).max(10080), status: z.enum(['draft','published','archived']).optional() })
export async function GET() { const result = await getLMSOverviewAction(); return Response.json(result, { status: result.success ? 200 : 400 }) }
export async function POST(request: Request) { try { const result = await createCourseAction(schema.parse(await request.json())); return Response.json(result, { status: result.success ? 201 : 400 }) } catch (error) { const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid course payload.'; return Response.json({ success: false, error: message }, { status: 400 }) } }
