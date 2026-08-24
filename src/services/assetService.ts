import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssetAssignmentRow, AssetRow, Database } from '@/src/lib/supabase'

export async function listAssets(supabase: SupabaseClient<Database>, organizationId: string) {
  const { data, error } = await supabase.from('assets').select('*').eq('organization_id', organizationId).order('asset_tag')
  if (error) throw new Error(error.message)
  return (data || []) as AssetRow[]
}

export async function listAssetAssignments(supabase: SupabaseClient<Database>, organizationId: string) {
  const { data, error } = await supabase.from('asset_assignments').select('*').eq('organization_id', organizationId).order('assigned_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as AssetAssignmentRow[]
}
