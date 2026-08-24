'use server'
import { toJson } from "@/lib/utils";

import { z } from 'zod'
import { createServerSupabaseClient, type AssistantConversationRow, type AssistantMessageRow } from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const createConversationSchema = z.object({ title: z.string().min(1).max(180), contextType: z.string().max(80).optional().nullable(), contextId: uuidSchema.optional().nullable() })
const appendMessageSchema = z.object({ conversationId: uuidSchema, role: z.enum(['user', 'assistant', 'tool']), content: z.string().min(1).max(20000), citations: z.unknown().optional(), toolCalls: z.unknown().optional(), modelName: z.string().max(180).optional().nullable(), tokensIn: z.number().int().nonnegative().optional().nullable(), tokensOut: z.number().int().nonnegative().optional().nullable() })

export async function createCopilotConversationAction(input: z.input<typeof createConversationSchema>): Promise<ActionResponse<AssistantConversationRow>> {
  const parsed = createConversationSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('assistant_conversations').insert({ organization_id: auth.data.organizationId, user_id: auth.data.userId, title: parsed.data.title, context_type: parsed.data.contextType || null, context_id: parsed.data.contextId || null }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Conversation creation returned no record.')
    revalidateWorkspacePaths('/')
    return actionSuccess(data as AssistantConversationRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create Copilot conversation.')
  }
}

export async function appendCopilotMessageAction(input: z.input<typeof appendMessageSchema>): Promise<ActionResponse<AssistantMessageRow>> {
  const parsed = appendMessageSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data: conversation, error: conversationError } = await supabase.from('assistant_conversations').select('*').eq('id', parsed.data.conversationId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (conversationError || !conversation) return actionFailure(conversationError?.message || 'Conversation was not found.')
    if (conversation.user_id !== auth.data.userId && !['owner', 'admin', 'hr_admin', 'hr_manager', 'system_admin'].includes(auth.data.roleCode)) return actionFailure('You are not authorized to append messages to this conversation.')
    const { data, error } = await supabase.from('assistant_messages').insert({ organization_id: auth.data.organizationId, conversation_id: parsed.data.conversationId, role: parsed.data.role, content: parsed.data.content, citations: toJson(parsed.data.citations || []), tool_calls: toJson(parsed.data.toolCalls || []), model_name: parsed.data.modelName || null, tokens_in: parsed.data.tokensIn || null, tokens_out: parsed.data.tokensOut || null }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Message creation returned no record.')
    const { error: touchError } = await supabase.from('assistant_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id)
    if (touchError) return actionFailure(`Message was written but conversation timestamp update failed: ${touchError.message}`)
    revalidateWorkspacePaths('/')
    return actionSuccess(data as AssistantMessageRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to append Copilot message.')
  }
}

export async function getCopilotConversationMessagesAction(conversationId: string): Promise<ActionResponse<AssistantMessageRow[]>> {
  const parsed = uuidSchema.safeParse(conversationId)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('assistant_messages').select('*').eq('conversation_id', parsed.data).eq('organization_id', auth.data.organizationId).order('created_at', { ascending: true })
    if (error) return actionFailure(error.message)
    return actionSuccess((data || []) as AssistantMessageRow[])
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load Copilot messages.')
  }
}
