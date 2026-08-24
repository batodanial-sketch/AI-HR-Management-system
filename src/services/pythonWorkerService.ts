import 'server-only'

import { enqueuePythonJob, getPythonBridgeHealth, getPythonJob, type PythonBridgeJobRequest, type PythonJobType } from '@/src/lib/pythonBridge'

export async function dispatchWorkerJob<TPayload extends Record<string, unknown>>(taskType: PythonJobType, request: PythonBridgeJobRequest<TPayload>) {
  return enqueuePythonJob(taskType, request)
}

export async function readWorkerJob<TPayload extends Record<string, unknown>>(jobId: string) {
  return getPythonJob<TPayload>(jobId)
}

export async function readWorkerHealth() {
  return getPythonBridgeHealth()
}
