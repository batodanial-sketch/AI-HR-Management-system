import type { Json } from '@/src/lib/database.types'

export type CopilotMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type CopilotToolExecution = {
  id: string
  name: string
  success: boolean
}

export type CopilotConfirmationRequest = {
  conversationId: string
  toolCall: {
    id: string
    name: string
    description: string
    arguments: Record<string, unknown>
    confirmationToken: string
    expiresAt: string
  }
}

export type CopilotStreamMetadata = {
  conversationId: string
  toolExecutions: CopilotToolExecution[]
}

export type CopilotAuditPayload = {
  workforce: Json
  toolExecutions: CopilotToolExecution[]
  model: string
}
