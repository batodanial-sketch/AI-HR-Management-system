import { toJson } from "@/lib/utils";
import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { createAdminSupabaseClient, isSupabaseAdminConfigured } from '@/src/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bridgePayloadSchema = z.object({
  organizationId: z.string().uuid(),
  event: z.enum(['ai_assessment_completed', 'workflow_completed', 'workflow_failed', 'scrape_completed', 'attendance_event', 'document_generated']),
  workflowId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  title: z.string().min(1).max(240).optional(),
  body: z.string().max(4000).optional(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
  payload: z.record(z.string(), z.unknown()).default({})
})

function failure(error: string, status: number) {
  return Response.json({ success: false, error }, { status })
}

function hasValidBridgeSecret(request: Request) {
  const expected = process.env.PYTHON_BRIDGE_WEBHOOK_SECRET
  const received = request.headers.get('x-fluxentiq-bridge-secret')
  if (!expected || !received) return false
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function POST(request: Request) {
  if (!process.env.PYTHON_BRIDGE_WEBHOOK_SECRET) return failure('Python bridge webhook secret is not configured.', 503)
  if (!hasValidBridgeSecret(request)) return failure('Unauthorized Python bridge request.', 401)
  if (!isSupabaseAdminConfigured) return failure('Supabase admin credentials are not configured for the Python bridge.', 503)

  let event: z.infer<typeof bridgePayloadSchema>
  try {
    event = bridgePayloadSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid Python bridge payload.'
    return failure(message, 400)
  }

  try {
    const supabase = createAdminSupabaseClient()
    const { data: organization, error: organizationError } = await supabase.from('organizations').select('id').eq('id', event.organizationId).maybeSingle()
    if (organizationError || !organization) return failure(organizationError?.message || 'Organization was not found.', 404)

    let workflowRunId = event.workflowRunId || null
    if (event.workflowId && event.status) {
      const { data: run, error: runError } = await supabase.from('workflow_runs').insert({
        organization_id: event.organizationId,
        workflow_id: event.workflowId,
        status: event.status,
        trigger_payload: toJson(event.payload),
        output: toJson(event.status === 'succeeded' ? event.payload : {}),
        error_message: event.status === 'failed' ? event.body || 'Python bridge reported a workflow failure.' : null,
        started_at: new Date().toISOString(),
        finished_at: ['succeeded', 'failed', 'cancelled'].includes(event.status) ? new Date().toISOString() : null
      }).select().single()
      if (runError || !run) return failure(runError?.message || 'Unable to persist workflow run.', 500)
      workflowRunId = run.id
    }

    if (event.title) {
      const { error: notificationError } = await supabase.from('notifications').insert({
        organization_id: event.organizationId,
        user_id: null,
        employee_id: event.employeeId || null,
        channel: 'in_app',
        title: event.title,
        body: event.body || null,
        link: workflowRunId ? `/workflows/${workflowRunId}` : null,
        delivered_at: new Date().toISOString()
      })
      if (notificationError) return failure(`Bridge event was received but notification persistence failed: ${notificationError.message}`, 500)
    }

    const { error: auditError } = await supabase.from('audit_logs').insert({
      organization_id: event.organizationId,
      actor_user_id: null,
      action: event.event === 'workflow_failed' ? 'update' : 'generate',
      entity_type: `python_bridge:${event.event}`,
      entity_id: workflowRunId || event.applicationId || event.candidateId || event.employeeId || null,
      before_state: null,
      after_state: toJson({ payload: event.payload, workflow_run_id: workflowRunId })
    })
    if (auditError) return failure(`Bridge event was received but audit persistence failed: ${auditError.message}`, 500)

    return Response.json({ success: true, data: { workflowRunId, event: event.event } }, { status: 202 })
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Python bridge processing failed.', 500)
  }
}
