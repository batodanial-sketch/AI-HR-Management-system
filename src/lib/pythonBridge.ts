import 'server-only'

export type PythonJobType = 'ai_assessment' | 'scrape' | 'workflow'
export type PythonJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type PythonBridgeJobRequest<TPayload extends Record<string, unknown>> = {
  organizationId: string
  requestedBy?: string
  payload: TPayload
}

export type PythonBridgeJob<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  id: string
  organization_id: string
  task_type: PythonJobType
  status: PythonJobStatus
  payload: TPayload
  output?: Record<string, unknown>
  error_message?: string | null
  requested_by?: string | null
  created_at: string
  started_at?: string | null
  finished_at?: string | null
}

export type PythonBridgeResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const taskPath: Record<PythonJobType, string> = {
  ai_assessment: '/internal/jobs/ai-assessment',
  scrape: '/internal/jobs/scrape',
  workflow: '/internal/jobs/workflow'
}

function configuration(): PythonBridgeResponse<{ baseUrl: string; token: string }> {
  const baseUrl = process.env.PYTHON_BRIDGE_URL || 'http://127.0.0.1:4173'
  const token = process.env.PYTHON_BRIDGE_TOKEN
  if (!token) return { success: false, error: 'PYTHON_BRIDGE_TOKEN is not configured in the Next.js server environment.' }
  return { success: true, data: { baseUrl: baseUrl.replace(/\/$/, ''), token } }
}

async function readResponse<T>(response: Response): Promise<PythonBridgeResponse<T>> {
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: string; } | null
  if (!response.ok || !payload?.success) return { success: false, error: payload?.error || `Python bridge request failed with HTTP ${response.status}.` }
  if (payload.data === undefined) return { success: false, error: 'Python bridge response did not include data.' }
  return { success: true, data: payload.data }
}

export async function enqueuePythonJob<TPayload extends Record<string, unknown>>(taskType: PythonJobType, request: PythonBridgeJobRequest<TPayload>): Promise<PythonBridgeResponse<PythonBridgeJob<TPayload>>> {
  const config = configuration()
  if (!config.success) return config
  try {
    const response = await fetch(`${config.data.baseUrl}${taskPath[taskType]}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fluxentiq-python-token': config.data.token
      },
      body: JSON.stringify({ organization_id: request.organizationId, requested_by: request.requestedBy || null, payload: request.payload }),
      cache: 'no-store'
    })
    return readResponse<PythonBridgeJob<TPayload>>(response)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to reach Python bridge.' }
  }
}

export async function getPythonJob<TPayload extends Record<string, unknown>>(jobId: string): Promise<PythonBridgeResponse<PythonBridgeJob<TPayload>>> {
  const config = configuration()
  if (!config.success) return config
  try {
    const response = await fetch(`${config.data.baseUrl}/internal/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { 'x-fluxentiq-python-token': config.data.token },
      cache: 'no-store'
    })
    return readResponse<PythonBridgeJob<TPayload>>(response)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to retrieve Python job status.' }
  }
}

export async function getPythonBridgeHealth(): Promise<PythonBridgeResponse<{ service: string; timestamp: string; ai_provider: string; anthropic_configured: boolean; scrape_allowlist_configured: boolean; next_callback_configured: boolean }>> {
  const config = configuration()
  if (!config.success) return config
  try {
    const response = await fetch(`${config.data.baseUrl}/internal/health`, {
      method: 'GET',
      headers: { 'x-fluxentiq-python-token': config.data.token },
      cache: 'no-store'
    })
    return readResponse(response)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to check Python bridge health.' }
  }
}
