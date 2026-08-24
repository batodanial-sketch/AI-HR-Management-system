'use server'
import { toJson } from "@/lib/utils";

import { z } from 'zod'
import {
  createServerSupabaseClient,
  type CandidateRow,
  type DocumentRow,
  type DocumentTemplateRow,
  type EmployeeRow,
  type Database,
} from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { isoDateTimeSchema, requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const templateSchema = z.object({
  name: z.string().min(2).max(180),
  category: z.string().min(2).max(120),
  subjectTemplate: z.string().max(500).optional().nullable(),
  bodyTemplate: z.string().min(1).max(50000),
  variables: z.array(z.string().min(1).max(100)).max(100).default([]),
  isActive: z.boolean().default(true)
})

const createDocumentSchema = z.object({
  employeeId: uuidSchema.optional().nullable(),
  candidateId: uuidSchema.optional().nullable(),
  templateId: uuidSchema.optional().nullable(),
  title: z.string().min(2).max(240),
  category: z.string().min(2).max(120),
  contentHtml: z.string().max(100000).optional().nullable(),
  storageKey: z.string().max(1000).optional().nullable(),
  expiresAt: isoDateTimeSchema.optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({})
}).superRefine((value, context) => {
  if (!value.employeeId && !value.candidateId && value.category !== 'company') {
    context.addIssue({ code: 'custom', message: 'An employee or candidate recipient is required unless the document category is company.' })
  }
})

const updateDocumentStatusSchema = z.object({
  documentId: uuidSchema,
  status: z.enum(['draft', 'generated', 'sent', 'signed', 'expired', 'void']),
  note: z.string().max(1000).optional().nullable()
})

export type DocumentsOverview = {
  templates: DocumentTemplateRow[]
  documents: DocumentRow[]
  employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'work_email'>[]
  candidates: Pick<CandidateRow, 'id' | 'first_name' | 'last_name' | 'email'>[]
}

export async function getDocumentsOverviewAction(): Promise<ActionResponse<DocumentsOverview>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const [templatesResult, documentsResult, employeesResult, candidatesResult] = await Promise.all([
      supabase.from('document_templates').select('*').eq('organization_id', auth.data.organizationId).order('updated_at', { ascending: false }),
      supabase.from('documents').select('*').eq('organization_id', auth.data.organizationId).order('updated_at', { ascending: false }),
      supabase.from('employees').select('id,first_name,last_name,work_email').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name'),
      supabase.from('candidates').select('id,first_name,last_name,email').eq('organization_id', auth.data.organizationId).order('first_name')
    ])
    const error = templatesResult.error || documentsResult.error || employeesResult.error || candidatesResult.error
    if (error) return actionFailure(error.message)
    return actionSuccess({
      templates: (templatesResult.data || []) as DocumentTemplateRow[],
      documents: (documentsResult.data || []) as DocumentRow[],
      employees: (employeesResult.data || []) as DocumentsOverview['employees'],
      candidates: (candidatesResult.data || []) as DocumentsOverview['candidates']
    })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load document records.')
  }
}

export async function createDocumentTemplateAction(input: z.input<typeof templateSchema>): Promise<ActionResponse<DocumentTemplateRow>> {
  const parsed = templateSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('document_templates').insert({
      organization_id: auth.data.organizationId,
      name: parsed.data.name,
      category: parsed.data.category,
      subject_template: parsed.data.subjectTemplate || null,
      body_template: parsed.data.bodyTemplate,
      variables: parsed.data.variables,
      is_active: parsed.data.isActive,
      version: 1,
      created_by: auth.data.userId
    }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Document template creation returned no record.')
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'create',
      entity_type: 'document_template',
      entity_id: data.id,
      before_state: null,
      after_state: { name: parsed.data.name, category: parsed.data.category, variable_count: parsed.data.variables.length }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(data as DocumentTemplateRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create document template.')
  }
}

export async function createDocumentAction(input: z.input<typeof createDocumentSchema>): Promise<ActionResponse<DocumentRow>> {
  const parsed = createDocumentSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    if (parsed.data.employeeId) {
      const { data: employee, error } = await supabase.from('employees').select('id').eq('id', parsed.data.employeeId).eq('organization_id', auth.data.organizationId).is('deleted_at', null).maybeSingle()
      if (error || !employee) return actionFailure(error?.message || 'Document employee recipient was not found.')
    }
    if (parsed.data.candidateId) {
      const { data: candidate, error } = await supabase.from('candidates').select('id').eq('id', parsed.data.candidateId).eq('organization_id', auth.data.organizationId).maybeSingle()
      if (error || !candidate) return actionFailure(error?.message || 'Document candidate recipient was not found.')
    }
    if (parsed.data.templateId) {
      const { data: template, error } = await supabase.from('document_templates').select('id').eq('id', parsed.data.templateId).eq('organization_id', auth.data.organizationId).maybeSingle()
      if (error || !template) return actionFailure(error?.message || 'Document template was not found.')
    }

    const { data, error } = await supabase.from('documents').insert({
      organization_id: auth.data.organizationId,
      employee_id: parsed.data.employeeId || null,
      candidate_id: parsed.data.candidateId || null,
      template_id: parsed.data.templateId || null,
      title: parsed.data.title,
      category: parsed.data.category,
      storage_key: parsed.data.storageKey || null,
      content_html: parsed.data.contentHtml || null,
      status: parsed.data.contentHtml || parsed.data.storageKey ? 'generated' : 'draft',
      generated_by: auth.data.userId,
      expires_at: parsed.data.expiresAt || null,
      metadata: toJson(parsed.data.metadata)
    }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Document creation returned no record.')
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'create',
      entity_type: 'document',
      entity_id: data.id,
      before_state: null,
      after_state: { category: parsed.data.category, employee_id: parsed.data.employeeId || null, candidate_id: parsed.data.candidateId || null, status: data.status }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(data as DocumentRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create document.')
  }
}

export async function updateDocumentStatusAction(input: z.input<typeof updateDocumentStatusSchema>): Promise<ActionResponse<DocumentRow>> {
  const parsed = updateDocumentStatusSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data: document, error: lookupError } = await supabase.from('documents').select('*').eq('id', parsed.data.documentId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (lookupError || !document) return actionFailure(lookupError?.message || 'Document was not found.')
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { status: parsed.data.status, updated_at: now }
    if (parsed.data.status === 'sent') patch.sent_at = now
    if (parsed.data.status === 'signed') patch.signed_at = now
    if (parsed.data.note) patch.metadata = { ...(typeof document.metadata === 'object' && document.metadata !== null && !Array.isArray(document.metadata) ? document.metadata : {}), latest_note: parsed.data.note }
    const { data, error } = await supabase.from('documents').update(patch as Database['public']['Tables']['documents']['Update']).eq('id', document.id).select().single()
    if (error || !data) return actionFailure(error?.message || 'Document status update returned no record.')
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'update',
      entity_type: 'document',
      entity_id: document.id,
      before_state: { status: document.status },
      after_state: { status: parsed.data.status, note: parsed.data.note || null }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(data as DocumentRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update document status.')
  }
}
