import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssistantConversationRow, AssistantMessageRow, Database } from '@/src/lib/supabase'

export async function createConversation(supabase: SupabaseClient<Database>, organizationId: string, userId: string, title: string) {
  const { data, error } = await supabase.from('assistant_conversations').insert({ organization_id: organizationId, user_id: userId, title, context_type: 'workspace', context_id: null }).select().single()
  if (error || !data) throw new Error(error?.message || 'Conversation creation returned no record.')
  return data as AssistantConversationRow
}

export async function appendConversationMessage(supabase: SupabaseClient<Database>, message: Partial<AssistantMessageRow>) {
  const { data, error } = await supabase.from('assistant_messages').insert(message).select().single()
  if (error || !data) throw new Error(error?.message || 'Assistant message creation returned no record.')
  return data as AssistantMessageRow
}

export async function getConversationMessages(supabase: SupabaseClient<Database>, organizationId: string, conversationId: string) {
  const { data, error } = await supabase.from('assistant_messages').select('*').eq('organization_id', organizationId).eq('conversation_id', conversationId).order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as AssistantMessageRow[]
}
