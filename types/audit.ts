import type { AuditLogRow, Json } from '@/src/lib/database.types'

export type AuditActionResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SystemAuditEntry = Pick<AuditLogRow, 'id' | 'organization_id' | 'actor_user_id' | 'action' | 'entity_type' | 'entity_id' | 'before_state' | 'after_state' | 'created_at'>

export type AuditWriteInput = {
  organizationId: string
  actorUserId?: string | null
  action: AuditLogRow['action']
  entityType: string
  entityId?: string | null
  beforeState?: Json | null
  afterState?: Json | null
}
