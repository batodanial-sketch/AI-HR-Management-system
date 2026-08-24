'use server'
import { toJson } from "@/lib/utils";

import { z } from 'zod'
import { createServerSupabaseClient, type AssetAssignmentRow, type AssetRow, type EmployeeRow } from '@/src/lib/supabase'
import { listAssetAssignments, listAssets } from '@/src/services/assetService'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { dateSchema, isoDateTimeSchema, requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const createAssetSchema = z.object({ assetTag: z.string().min(2).max(100), name: z.string().min(2).max(240), category: z.string().min(2).max(120), manufacturer: z.string().max(160).optional().nullable(), model: z.string().max(160).optional().nullable(), serialNumber: z.string().max(160).optional().nullable(), purchaseDate: dateSchema.optional().nullable(), purchaseCost: z.number().nonnegative().optional().nullable(), currencyCode: z.string().length(3).default('USD'), metadata: z.record(z.string(), z.unknown()).default({}) })
const assignSchema = z.object({ assetId: uuidSchema, employeeId: uuidSchema, dueBackAt: isoDateTimeSchema.optional().nullable(), assignmentCondition: z.string().max(2000).optional().nullable(), notes: z.string().max(4000).optional().nullable() })
const returnSchema = z.object({ assignmentId: uuidSchema, returnCondition: z.string().max(2000).optional().nullable(), notes: z.string().max(4000).optional().nullable(), outcome: z.enum(['available', 'maintenance', 'lost']).default('available') })

export type AssetOverview = { assets: AssetRow[]; assignments: AssetAssignmentRow[]; employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'employee_number' | 'status'>[] }

export async function getAssetOverviewAction(): Promise<ActionResponse<AssetOverview>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [assets, assignments, employeeResult] = await Promise.all([listAssets(supabase, auth.data.organizationId), listAssetAssignments(supabase, auth.data.organizationId), supabase.from('employees').select('id,first_name,last_name,employee_number,status').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name')])
    if (employeeResult.error) return actionFailure(employeeResult.error.message)
    return actionSuccess({ assets, assignments, employees: (employeeResult.data || []) as AssetOverview['employees'] })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load asset inventory.')
  }
}

export async function createAssetAction(input: z.input<typeof createAssetSchema>): Promise<ActionResponse<AssetRow>> {
  const parsed = createAssetSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('assets').insert({ organization_id: auth.data.organizationId, asset_tag: parsed.data.assetTag, name: parsed.data.name, category: parsed.data.category, manufacturer: parsed.data.manufacturer || null, model: parsed.data.model || null, serial_number: parsed.data.serialNumber || null, status: 'available', purchase_date: parsed.data.purchaseDate || null, purchase_cost: parsed.data.purchaseCost ?? null, currency_code: parsed.data.currencyCode.toUpperCase(), metadata: toJson(parsed.data.metadata) }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Asset creation returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'asset', entity_id: data.id, before_state: null, after_state: { asset_tag: data.asset_tag, category: data.category, status: data.status } })
    revalidateWorkspacePaths('/', '/assets', '/onboarding')
    return actionSuccess(data as AssetRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create asset.')
  }
}

export async function assignAssetAction(input: z.input<typeof assignSchema>): Promise<ActionResponse<AssetAssignmentRow>> {
  const parsed = assignSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [assetResult, employeeResult] = await Promise.all([
      supabase.from('assets').select('*').eq('id', parsed.data.assetId).eq('organization_id', auth.data.organizationId).maybeSingle(),
      supabase.from('employees').select('id').eq('id', parsed.data.employeeId).eq('organization_id', auth.data.organizationId).is('deleted_at', null).maybeSingle()
    ])
    if (assetResult.error || !assetResult.data) return actionFailure(assetResult.error?.message || 'Asset was not found.')
    if (employeeResult.error || !employeeResult.data) return actionFailure(employeeResult.error?.message || 'Employee was not found.')
    if (assetResult.data.status !== 'available') return actionFailure('Only available assets can be assigned.')
    const { data: assignment, error: assignmentError } = await supabase.from('asset_assignments').insert({ organization_id: auth.data.organizationId, asset_id: parsed.data.assetId, employee_id: parsed.data.employeeId, assigned_by: auth.data.userId, due_back_at: parsed.data.dueBackAt || null, assignment_condition: parsed.data.assignmentCondition || null, notes: parsed.data.notes || null, status: 'assigned' }).select().single()
    if (assignmentError || !assignment) return actionFailure(assignmentError?.message || 'Asset assignment returned no record.')
    const { error: assetUpdateError } = await supabase.from('assets').update({ status: 'assigned', updated_at: new Date().toISOString() }).eq('id', parsed.data.assetId).eq('organization_id', auth.data.organizationId)
    if (assetUpdateError) { await supabase.from('asset_assignments').delete().eq('id', assignment.id).eq('organization_id', auth.data.organizationId); return actionFailure(`Asset assignment was rolled back: ${assetUpdateError.message}`) }
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'asset_assignment', entity_id: assignment.id, before_state: { asset_status: 'available' }, after_state: { asset_id: parsed.data.assetId, employee_id: parsed.data.employeeId, status: 'assigned' } })
    revalidateWorkspacePaths('/', '/assets', '/onboarding')
    return actionSuccess(assignment as AssetAssignmentRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to assign asset.')
  }
}

export async function returnAssetAction(input: z.input<typeof returnSchema>): Promise<ActionResponse<AssetAssignmentRow>> {
  const parsed = returnSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: assignment, error: lookupError } = await supabase.from('asset_assignments').select('*').eq('id', parsed.data.assignmentId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (lookupError || !assignment) return actionFailure(lookupError?.message || 'Asset assignment was not found.')
    if (assignment.status !== 'assigned') return actionFailure('Only active asset assignments can be returned.')
    const { data, error } = await supabase.from('asset_assignments').update({ status: parsed.data.outcome === 'lost' ? 'lost' : 'returned', returned_at: new Date().toISOString(), return_condition: parsed.data.returnCondition || null, notes: parsed.data.notes || assignment.notes, updated_at: new Date().toISOString() }).eq('id', assignment.id).select().single()
    if (error || !data) return actionFailure(error?.message || 'Asset return update returned no record.')
    const { error: assetError } = await supabase.from('assets').update({ status: parsed.data.outcome, updated_at: new Date().toISOString() }).eq('id', assignment.asset_id).eq('organization_id', auth.data.organizationId)
    if (assetError) return actionFailure(`Assignment was returned but asset status update failed: ${assetError.message}`)
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'asset_assignment', entity_id: assignment.id, before_state: { status: 'assigned' }, after_state: { status: data.status, asset_status: parsed.data.outcome } })
    revalidateWorkspacePaths('/', '/assets', '/offboarding')
    return actionSuccess(data as AssetAssignmentRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to return asset.')
  }
}
