/** AUTO-GENERATED database types — MERGED (live + canonical) schema.

 * Merges the LIVE Supabase schema with the canonical migration columns so the
 * types reflect the intended superset. Drifted tables (live missing canonical
 * columns) are reconciled here; run supabase/RECONCILE_COLUMNS.sql to make the
 * live DB match. Regenerate with scripts/gen-database-types.py.

 * Enum columns are `string`; jsonb columns are `Json`. Insert/Update are
 * all-optional so partial payloads type-check while unknown column names fail.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrgRole = "owner" | "admin" | "manager" | "member";
export type EmploymentStatus = "active" | "on_leave" | "terminated";
export type RecruitmentStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";
export type Recommendation = "advance" | "hold" | "reject";
export type LeaveType = "pto" | "sick" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type PayrollRunStatus = "draft" | "processing" | "completed" | "failed";
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";
export type DealStage =
  | "discovery"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export interface Database {
  public: {
    Tables: {
      access_revocation_records: {
        Row: {
          id: string;
          organization_id: string;
          offboarding_case_id: string;
          system_name: string;
          account_identifier: string;
          status: string;
          revoked_by: string;
          revoked_at: string;
          evidence: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          offboarding_case_id?: string | null;
          system_name?: string | null;
          account_identifier?: string | null;
          status?: string | null;
          revoked_by?: string | null;
          revoked_at?: string | null;
          evidence?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          offboarding_case_id?: string | null;
          system_name?: string | null;
          account_identifier?: string | null;
          status?: string | null;
          revoked_by?: string | null;
          revoked_at?: string | null;
          evidence?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      activity_logs: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          value: number;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          user_id?: string | null;
          type?: string | null;
          value?: number | null;
          note?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          user_id?: string | null;
          type?: string | null;
          value?: number | null;
          note?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      ai_insights: {
        Row: {
          date: string;
          insight: string;
          action: string;
          created_at: string;
          risk_level: string;
          user_id: string;
          final_insight: string;
          priority: string;
        };
        Insert: {
          date?: string | null;
          insight?: string | null;
          action?: string | null;
          created_at?: string | null;
          risk_level?: string | null;
          user_id?: string | null;
          final_insight?: string | null;
          priority?: string | null;
        };
        Update: {
          date?: string | null;
          insight?: string | null;
          action?: string | null;
          created_at?: string | null;
          risk_level?: string | null;
          user_id?: string | null;
          final_insight?: string | null;
          priority?: string | null;
        };
        Relationships: [];
      };

      ai_interview_kits: {
        Row: {
          id: string;
          organization_id: string;
          application_id: string;
          assessment_id: string;
          generated_by: string;
          model_provider: string;
          model_name: string;
          prompt_version: string;
          interview_round: string;
          duration_minutes: number;
          questions: Json;
          assessment_rubric: Json;
          time_allocation: Json;
          raw_response: Json;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          application_id?: string | null;
          assessment_id?: string | null;
          generated_by?: string | null;
          model_provider?: string | null;
          model_name?: string | null;
          prompt_version?: string | null;
          interview_round?: string | null;
          duration_minutes?: number | null;
          questions?: Json | null;
          assessment_rubric?: Json | null;
          time_allocation?: Json | null;
          raw_response?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          application_id?: string | null;
          assessment_id?: string | null;
          generated_by?: string | null;
          model_provider?: string | null;
          model_name?: string | null;
          prompt_version?: string | null;
          interview_round?: string | null;
          duration_minutes?: number | null;
          questions?: Json | null;
          assessment_rubric?: Json | null;
          time_allocation?: Json | null;
          raw_response?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      ai_provider_configs: {
        Row: {
          id: string;
          organization_id: string;
          default_provider: string;
          default_model: string;
          fallback_provider: string;
          fallback_model: string;
          custom_endpoint_base_url: string;
          custom_model_id: string;
          enabled: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          default_provider?: string | null;
          default_model?: string | null;
          fallback_provider?: string | null;
          fallback_model?: string | null;
          custom_endpoint_base_url?: string | null;
          custom_model_id?: string | null;
          enabled?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          default_provider?: string | null;
          default_model?: string | null;
          fallback_provider?: string | null;
          fallback_model?: string | null;
          custom_endpoint_base_url?: string | null;
          custom_model_id?: string | null;
          enabled?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      ai_usage: {
        Row: {
          id: string;
          organization_id: string;
          feature: string;
          model: string;
          tokens_in: number;
          tokens_out: number;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          feature?: string | null;
          model?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          feature?: string | null;
          model?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      ai_usage_logs: {
        Row: {
          id: string;
          organization_id: string;
          model: string;
          feature: string;
          prompt_tokens: number;
          completion_tokens: number;
          cost_usd: number;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          model?: string | null;
          feature?: string | null;
          prompt_tokens?: number | null;
          completion_tokens?: number | null;
          cost_usd?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          model?: string | null;
          feature?: string | null;
          prompt_tokens?: number | null;
          completion_tokens?: number | null;
          cost_usd?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      organization_configs: {
        Row: {
          organization_id: string;
          dashboard_layout_json: Json;
          dynamic_schema_json: Json;
          copilot_rules_json: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          organization_id?: string | null;
          dashboard_layout_json?: Json | null;
          dynamic_schema_json?: Json | null;
          copilot_rules_json?: Json | null;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          organization_id?: string | null;
          dashboard_layout_json?: Json | null;
          dynamic_schema_json?: Json | null;
          copilot_rules_json?: Json | null;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };

      workflow_templates: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          description: string | null;
          steps_json: Json;
          trigger_type: string;
          schedule_cron: string | null;
          schedule_time: string | null;
          target_roles: Json;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          description?: string | null;
          steps_json?: Json | null;
          trigger_type?: string | null;
          schedule_cron?: string | null;
          schedule_time?: string | null;
          target_roles?: Json | null;
          is_active?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          description?: string | null;
          steps_json?: Json | null;
          trigger_type?: string | null;
          schedule_cron?: string | null;
          schedule_time?: string | null;
          target_roles?: Json | null;
          is_active?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      daily_employee_tasks: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          workflow_template_id: string | null;
          task_date: string;
          status: string;
          payload_json: Json;
          due_time: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          workflow_template_id?: string | null;
          task_date?: string | null;
          status?: string | null;
          payload_json?: Json | null;
          due_time?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          workflow_template_id?: string | null;
          task_date?: string | null;
          status?: string | null;
          payload_json?: Json | null;
          due_time?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      workflow_executions: {
        Row: {
          id: string;
          organization_id: string;
          workflow_id: string | null;
          workflow_template_id: string | null;
          task_id: string | null;
          executed_at: string;
          status: string;
          error_log: string | null;
          execution_payload: Json;
          result_json: Json;
          duration_ms: number | null;
          triggered_by: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          workflow_id?: string | null;
          workflow_template_id?: string | null;
          task_id?: string | null;
          executed_at?: string | null;
          status?: string | null;
          error_log?: string | null;
          execution_payload?: Json | null;
          result_json?: Json | null;
          duration_ms?: number | null;
          triggered_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          workflow_id?: string | null;
          workflow_template_id?: string | null;
          task_id?: string | null;
          executed_at?: string | null;
          status?: string | null;
          error_log?: string | null;
          execution_payload?: Json | null;
          result_json?: Json | null;
          duration_ms?: number | null;
          triggered_by?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      api_credentials: {
        Row: {
          id: string;
          organization_id: string;
          provider: string;
          key_name: string;
          encrypted_value: string;
          encryption_algorithm: string;
          encryption_key_version: number;
          masked_display: string;
          enabled: boolean;
          created_by: string;
          last_used_at: string;
          rotated_at: string;
          revoked_at: string;
          revoked_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          provider?: string | null;
          key_name?: string | null;
          encrypted_value?: string | null;
          encryption_algorithm?: string | null;
          encryption_key_version?: number | null;
          masked_display?: string | null;
          enabled?: boolean | null;
          created_by?: string | null;
          last_used_at?: string | null;
          rotated_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          provider?: string | null;
          key_name?: string | null;
          encrypted_value?: string | null;
          encryption_algorithm?: string | null;
          encryption_key_version?: number | null;
          masked_display?: string | null;
          enabled?: boolean | null;
          created_by?: string | null;
          last_used_at?: string | null;
          rotated_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      api_keys: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string;
          name: string;
          key_prefix: string;
          secret_hash: string;
          last_used_at: string;
          expires_at: string;
          revoked_at: string;
          created_at: string;
          scopes: Json;
          revoked_reason: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          created_by?: string | null;
          name?: string | null;
          key_prefix?: string | null;
          secret_hash?: string | null;
          last_used_at?: string | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string | null;
          scopes?: Json | null;
          revoked_reason?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          created_by?: string | null;
          name?: string | null;
          key_prefix?: string | null;
          secret_hash?: string | null;
          last_used_at?: string | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string | null;
          scopes?: Json | null;
          revoked_reason?: string | null;
        };
        Relationships: [];
      };

      applications: {
        Row: {
          id: string;
          organization_id: string;
          candidate_id: string;
          job_opening_id: string;
          stage: string;
          source: string;
          applied_at: string;
          owner_id: string;
          rejection_reason: string;
          hired_employee_id: string;
          stage_changed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          candidate_id?: string | null;
          job_opening_id?: string | null;
          stage?: string | null;
          source?: string | null;
          applied_at?: string | null;
          owner_id?: string | null;
          rejection_reason?: string | null;
          hired_employee_id?: string | null;
          stage_changed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          candidate_id?: string | null;
          job_opening_id?: string | null;
          stage?: string | null;
          source?: string | null;
          applied_at?: string | null;
          owner_id?: string | null;
          rejection_reason?: string | null;
          hired_employee_id?: string | null;
          stage_changed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      asset_assignments: {
        Row: {
          id: string;
          organization_id: string;
          asset_id: string;
          employee_id: string;
          assigned_by: string;
          assigned_at: string;
          due_back_at: string;
          returned_at: string;
          status: string;
          assignment_condition: string;
          return_condition: string;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          asset_id?: string | null;
          employee_id?: string | null;
          assigned_by?: string | null;
          assigned_at?: string | null;
          due_back_at?: string | null;
          returned_at?: string | null;
          status?: string | null;
          assignment_condition?: string | null;
          return_condition?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          asset_id?: string | null;
          employee_id?: string | null;
          assigned_by?: string | null;
          assigned_at?: string | null;
          due_back_at?: string | null;
          returned_at?: string | null;
          status?: string | null;
          assignment_condition?: string | null;
          return_condition?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      assets: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          category: string;
          status: string;
          assignee_id: string;
          assignee: string;
          created_at: string;
          asset_tag: string;
          manufacturer: string;
          model: string;
          serial_number: string;
          purchase_date: string;
          purchase_cost: number;
          currency_code: string;
          metadata: Json;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          category?: string | null;
          status?: string | null;
          assignee_id?: string | null;
          assignee?: string | null;
          created_at?: string | null;
          asset_tag?: string | null;
          manufacturer?: string | null;
          model?: string | null;
          serial_number?: string | null;
          purchase_date?: string | null;
          purchase_cost?: number | null;
          currency_code?: string | null;
          metadata?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          category?: string | null;
          status?: string | null;
          assignee_id?: string | null;
          assignee?: string | null;
          created_at?: string | null;
          asset_tag?: string | null;
          manufacturer?: string | null;
          model?: string | null;
          serial_number?: string | null;
          purchase_date?: string | null;
          purchase_cost?: number | null;
          currency_code?: string | null;
          metadata?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      assistant_conversations: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          title: string;
          context_type: string;
          context_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          title?: string | null;
          context_type?: string | null;
          context_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          title?: string | null;
          context_type?: string | null;
          context_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      assistant_messages: {
        Row: {
          id: string;
          organization_id: string;
          conversation_id: string;
          role: string;
          content: string;
          citations: Json;
          tool_calls: Json;
          model_name: string;
          tokens_in: number;
          tokens_out: number;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          conversation_id?: string | null;
          role?: string | null;
          content?: string | null;
          citations?: Json | null;
          tool_calls?: Json | null;
          model_name?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          conversation_id?: string | null;
          role?: string | null;
          content?: string | null;
          citations?: Json | null;
          tool_calls?: Json | null;
          model_name?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      attendance_events: {
        Row: {
          id: string;
          organization_id: string;
          attendance_record_id: string;
          employee_id: string;
          event_type: string;
          occurred_at: string;
          latitude: number;
          longitude: number;
          metadata: Json;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          attendance_record_id?: string | null;
          employee_id?: string | null;
          event_type?: string | null;
          occurred_at?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          metadata?: Json | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          attendance_record_id?: string | null;
          employee_id?: string | null;
          event_type?: string | null;
          occurred_at?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          metadata?: Json | null;
        };
        Relationships: [];
      };

      attendance_policies: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          workday_start: string;
          workday_end: string;
          grace_minutes: number;
          overtime_after_minutes: number;
          rules: Json;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          workday_start?: string | null;
          workday_end?: string | null;
          grace_minutes?: number | null;
          overtime_after_minutes?: number | null;
          rules?: Json | null;
          is_default?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          workday_start?: string | null;
          workday_end?: string | null;
          grace_minutes?: number | null;
          overtime_after_minutes?: number | null;
          rules?: Json | null;
          is_default?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      attendance_records: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          work_date: string;
          status: string;
          check_in_at: string;
          check_out_at: string;
          worked_minutes: number;
          overtime_minutes: number;
          source: string;
          note: string;
          approved_by: string;
          created_at: string;
          updated_at: string;
          employee_name: string;
          clock_in: string;
          clock_out: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          work_date?: string | null;
          status?: string | null;
          check_in_at?: string | null;
          check_out_at?: string | null;
          worked_minutes?: number | null;
          overtime_minutes?: number | null;
          source?: string | null;
          note?: string | null;
          approved_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          employee_name?: string | null;
          clock_in?: string | null;
          clock_out?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          work_date?: string | null;
          status?: string | null;
          check_in_at?: string | null;
          check_out_at?: string | null;
          worked_minutes?: number | null;
          overtime_minutes?: number | null;
          source?: string | null;
          note?: string | null;
          approved_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          employee_name?: string | null;
          clock_in?: string | null;
          clock_out?: string | null;
        };
        Relationships: [];
      };

      audit_logs: {
        Row: {
          id: number;
          organization_id: string;
          actor_user_id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          before_state: Json;
          after_state: Json;
          ip_address: string;
          user_agent: string;
          created_at: string;
          actor_id: string;
          metadata: Json;
        };
        Insert: {
          id?: number | null;
          organization_id?: string | null;
          actor_user_id?: string | null;
          action?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string | null;
          actor_id?: string | null;
          metadata?: Json | null;
        };
        Update: {
          id?: number | null;
          organization_id?: string | null;
          actor_user_id?: string | null;
          action?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string | null;
          actor_id?: string | null;
          metadata?: Json | null;
        };
        Relationships: [];
      };

      automation_logs: {
        Row: {
          id: string;
          workflow_name: string;
          execution_id: string;
          status: string;
          trigger_source: string;
          payload: Json;
          error_message: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          workflow_name?: string | null;
          execution_id?: string | null;
          status?: string | null;
          trigger_source?: string | null;
          payload?: Json | null;
          error_message?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          workflow_name?: string | null;
          execution_id?: string | null;
          status?: string | null;
          trigger_source?: string | null;
          payload?: Json | null;
          error_message?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      benefit_dependents: {
        Row: {
          id: string;
          organization_id: string;
          benefit_enrollment_id: string;
          full_name: string;
          relationship: string;
          date_of_birth: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          benefit_enrollment_id?: string | null;
          full_name?: string | null;
          relationship?: string | null;
          date_of_birth?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          benefit_enrollment_id?: string | null;
          full_name?: string | null;
          relationship?: string | null;
          date_of_birth?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      benefit_enrollments: {
        Row: {
          id: string;
          organization_id: string;
          benefit_plan_id: string;
          employee_id: string;
          status: string;
          effective_date: string;
          ended_at: string;
          selected_coverage: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          benefit_plan_id?: string | null;
          employee_id?: string | null;
          status?: string | null;
          effective_date?: string | null;
          ended_at?: string | null;
          selected_coverage?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          benefit_plan_id?: string | null;
          employee_id?: string | null;
          status?: string | null;
          effective_date?: string | null;
          ended_at?: string | null;
          selected_coverage?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      benefit_plans: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          provider: string;
          plan_type: string;
          employee_cost: number;
          employer_cost: number;
          status: string;
          created_at: string;
          description: string;
          currency_code: string;
          enrollment_start: string;
          enrollment_end: string;
          metadata: Json;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          provider?: string | null;
          plan_type?: string | null;
          employee_cost?: number | null;
          employer_cost?: number | null;
          status?: string | null;
          created_at?: string | null;
          description?: string | null;
          currency_code?: string | null;
          enrollment_start?: string | null;
          enrollment_end?: string | null;
          metadata?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          provider?: string | null;
          plan_type?: string | null;
          employee_cost?: number | null;
          employer_cost?: number | null;
          status?: string | null;
          created_at?: string | null;
          description?: string | null;
          currency_code?: string | null;
          enrollment_start?: string | null;
          enrollment_end?: string | null;
          metadata?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      billing_settings: {
        Row: {
          id: string;
          organization_id: string;
          billing_email: string;
          billing_contact_name: string;
          invoice_notes: string;
          tax_registration_number: string;
          external_customer_reference: string;
          plan_override: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          billing_email?: string | null;
          billing_contact_name?: string | null;
          invoice_notes?: string | null;
          tax_registration_number?: string | null;
          external_customer_reference?: string | null;
          plan_override?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          billing_email?: string | null;
          billing_contact_name?: string | null;
          invoice_notes?: string | null;
          tax_registration_number?: string | null;
          external_customer_reference?: string | null;
          plan_override?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      bonus_awards: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          payroll_cycle_id: string;
          amount: number;
          currency_code: string;
          reason: string;
          status: string;
          approved_by: string;
          approved_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          payroll_cycle_id?: string | null;
          amount?: number | null;
          currency_code?: string | null;
          reason?: string | null;
          status?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          payroll_cycle_id?: string | null;
          amount?: number | null;
          currency_code?: string | null;
          reason?: string | null;
          status?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      candidate_ai_assessments: {
        Row: {
          id: string;
          organization_id: string;
          candidate_id: string;
          application_id: string;
          resume_id: string;
          model_provider: string;
          model_name: string;
          prompt_version: string;
          overall_score: number;
          job_match_score: number;
          experience_score: number;
          skills_score: number;
          education_score: number;
          recommendation: string;
          strengths: Json;
          gaps: Json;
          rationale: string;
          raw_response: Json;
          reviewed_by: string;
          reviewed_at: string;
          created_at: string;
          citations: Json;
          suggested_questions: Json;
          screening_latency_ms: number;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          candidate_id?: string | null;
          application_id?: string | null;
          resume_id?: string | null;
          model_provider?: string | null;
          model_name?: string | null;
          prompt_version?: string | null;
          overall_score?: number | null;
          job_match_score?: number | null;
          experience_score?: number | null;
          skills_score?: number | null;
          education_score?: number | null;
          recommendation?: string | null;
          strengths?: Json | null;
          gaps?: Json | null;
          rationale?: string | null;
          raw_response?: Json | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string | null;
          citations?: Json | null;
          suggested_questions?: Json | null;
          screening_latency_ms?: number | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          candidate_id?: string | null;
          application_id?: string | null;
          resume_id?: string | null;
          model_provider?: string | null;
          model_name?: string | null;
          prompt_version?: string | null;
          overall_score?: number | null;
          job_match_score?: number | null;
          experience_score?: number | null;
          skills_score?: number | null;
          education_score?: number | null;
          recommendation?: string | null;
          strengths?: Json | null;
          gaps?: Json | null;
          rationale?: string | null;
          raw_response?: Json | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string | null;
          citations?: Json | null;
          suggested_questions?: Json | null;
          screening_latency_ms?: number | null;
        };
        Relationships: [];
      };

      candidate_evaluations: {
        Row: {
          id: string;
          candidate_id: string;
          score: number;
          summary: string;
          recommendation: string;
          model: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          candidate_id?: string | null;
          score?: number | null;
          summary?: string | null;
          recommendation?: string | null;
          model?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          candidate_id?: string | null;
          score?: number | null;
          summary?: string | null;
          recommendation?: string | null;
          model?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      candidates: {
        Row: {
          id: string;
          organization_id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          location: string;
          linkedin_url: string;
          portfolio_url: string;
          source: string;
          consent_at: string;
          tags: string[];
          talent_pool_status: string;
          created_at: string;
          updated_at: string;
          job_posting_id: string;
          match_score: number;
          resume_url: string;
          source_tag: string;
          stage: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          location?: string | null;
          linkedin_url?: string | null;
          portfolio_url?: string | null;
          source?: string | null;
          consent_at?: string | null;
          tags?: string[] | null;
          talent_pool_status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          job_posting_id?: string | null;
          match_score?: number | null;
          resume_url?: string | null;
          source_tag?: string | null;
          stage?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          location?: string | null;
          linkedin_url?: string | null;
          portfolio_url?: string | null;
          source?: string | null;
          consent_at?: string | null;
          tags?: string[] | null;
          talent_pool_status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          job_posting_id?: string | null;
          match_score?: number | null;
          resume_url?: string | null;
          source_tag?: string | null;
          stage?: string | null;
        };
        Relationships: [];
      };

      certification_definitions: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          issuer: string;
          validity_months: number;
          course_id: string;
          template_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          issuer?: string | null;
          validity_months?: number | null;
          course_id?: string | null;
          template_key?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          issuer?: string | null;
          validity_months?: number | null;
          course_id?: string | null;
          template_key?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      compensation_bands: {
        Row: {
          id: string;
          organization_id: string;
          level: string;
          title: string;
          min_salary: number;
          mid_salary: number;
          max_salary: number;
          currency: string;
          created_at: string;
          job_title_id: string;
          name: string;
          currency_code: string;
          midpoint_salary: number;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          level?: string | null;
          title?: string | null;
          min_salary?: number | null;
          mid_salary?: number | null;
          max_salary?: number | null;
          currency?: string | null;
          created_at?: string | null;
          job_title_id?: string | null;
          name?: string | null;
          currency_code?: string | null;
          midpoint_salary?: number | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          level?: string | null;
          title?: string | null;
          min_salary?: number | null;
          mid_salary?: number | null;
          max_salary?: number | null;
          currency?: string | null;
          created_at?: string | null;
          job_title_id?: string | null;
          name?: string | null;
          currency_code?: string | null;
          midpoint_salary?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      compensation_packages: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          currency_code: string;
          annual_salary: number;
          pay_frequency: string;
          effective_from: string;
          effective_to: string;
          components: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          currency_code?: string | null;
          annual_salary?: number | null;
          pay_frequency?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          components?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          currency_code?: string | null;
          annual_salary?: number | null;
          pay_frequency?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          components?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      compliance_assignments: {
        Row: {
          id: string;
          organization_id: string;
          requirement_id: string;
          employee_id: string;
          due_date: string;
          status: string;
          completed_at: string;
          assigned_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          requirement_id?: string | null;
          employee_id?: string | null;
          due_date?: string | null;
          status?: string | null;
          completed_at?: string | null;
          assigned_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          requirement_id?: string | null;
          employee_id?: string | null;
          due_date?: string | null;
          status?: string | null;
          completed_at?: string | null;
          assigned_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      compliance_requirements: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          description: string;
          course_id: string;
          certification_id: string;
          recurrence_months: number;
          is_mandatory: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          description?: string | null;
          course_id?: string | null;
          certification_id?: string | null;
          recurrence_months?: number | null;
          is_mandatory?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          description?: string | null;
          course_id?: string | null;
          certification_id?: string | null;
          recurrence_months?: number | null;
          is_mandatory?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      contractor_invoices: {
        Row: {
          id: string;
          organization_id: string;
          contractor_id: string;
          contractor: string;
          invoice_number: string;
          total_amount: number;
          currency: string;
          status: string;
          created_at: string;
          invoice_date: string;
          due_date: string;
          currency_code: string;
          storage_key: string;
          ocr_data: Json;
          approved_by: string;
          approved_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          contractor_id?: string | null;
          contractor?: string | null;
          invoice_number?: string | null;
          total_amount?: number | null;
          currency?: string | null;
          status?: string | null;
          created_at?: string | null;
          invoice_date?: string | null;
          due_date?: string | null;
          currency_code?: string | null;
          storage_key?: string | null;
          ocr_data?: Json | null;
          approved_by?: string | null;
          approved_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          contractor_id?: string | null;
          contractor?: string | null;
          invoice_number?: string | null;
          total_amount?: number | null;
          currency?: string | null;
          status?: string | null;
          created_at?: string | null;
          invoice_date?: string | null;
          due_date?: string | null;
          currency_code?: string | null;
          storage_key?: string | null;
          ocr_data?: Json | null;
          approved_by?: string | null;
          approved_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      contractors: {
        Row: {
          id: string;
          organization_id: string;
          legal_name: string;
          email: string;
          country_code: string;
          currency_code: string;
          status: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          legal_name?: string | null;
          email?: string | null;
          country_code?: string | null;
          currency_code?: string | null;
          status?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          legal_name?: string | null;
          email?: string | null;
          country_code?: string | null;
          currency_code?: string | null;
          status?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      currency_rates: {
        Row: {
          id: string;
          organization_id: string;
          base_currency: string;
          quote_currency: string;
          rate: number;
          source: string;
          as_of_date: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          base_currency?: string | null;
          quote_currency?: string | null;
          rate?: number | null;
          source?: string | null;
          as_of_date?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          base_currency?: string | null;
          quote_currency?: string | null;
          rate?: number | null;
          source?: string | null;
          as_of_date?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      dashboard_metrics: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          label: string;
          value: number;
          delta: number;
          delta_label: string;
          spark: number[];
          format: string;
          currency: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          key?: string | null;
          label?: string | null;
          value?: number | null;
          delta?: number | null;
          delta_label?: string | null;
          spark?: number[] | null;
          format?: string | null;
          currency?: string | null;
          position?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          key?: string | null;
          label?: string | null;
          value?: number | null;
          delta?: number | null;
          delta_label?: string | null;
          spark?: number[] | null;
          format?: string | null;
          currency?: string | null;
          position?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      deals: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string;
          name: string;
          value: number;
          currency: string;
          stage: string;
          probability: number;
          expected_close_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          lead_id?: string | null;
          name?: string | null;
          value?: number | null;
          currency?: string | null;
          stage?: string | null;
          probability?: number | null;
          expected_close_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          lead_id?: string | null;
          name?: string | null;
          value?: number | null;
          currency?: string | null;
          stage?: string | null;
          probability?: number | null;
          expected_close_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      departments: {
        Row: {
          id: string;
          organization_id: string;
          parent_id: string;
          head_employee_id: string;
          name: string;
          code: string;
          cost_center: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          parent_id?: string | null;
          head_employee_id?: string | null;
          name?: string | null;
          code?: string | null;
          cost_center?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          parent_id?: string | null;
          head_employee_id?: string | null;
          name?: string | null;
          code?: string | null;
          cost_center?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      document_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          category: string;
          subject_template: string;
          body_template: string;
          variables: Json;
          is_active: boolean;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          category?: string | null;
          subject_template?: string | null;
          body_template?: string | null;
          variables?: Json | null;
          is_active?: boolean | null;
          version?: number | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          category?: string | null;
          subject_template?: string | null;
          body_template?: string | null;
          variables?: Json | null;
          is_active?: boolean | null;
          version?: number | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      documents: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          candidate_id: string;
          template_id: string;
          title: string;
          category: string;
          storage_key: string;
          content_html: string;
          status: string;
          generated_by: string;
          sent_at: string;
          signed_at: string;
          expires_at: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          candidate_id?: string | null;
          template_id?: string | null;
          title?: string | null;
          category?: string | null;
          storage_key?: string | null;
          content_html?: string | null;
          status?: string | null;
          generated_by?: string | null;
          sent_at?: string | null;
          signed_at?: string | null;
          expires_at?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          candidate_id?: string | null;
          template_id?: string | null;
          title?: string | null;
          category?: string | null;
          storage_key?: string | null;
          content_html?: string | null;
          status?: string | null;
          generated_by?: string | null;
          sent_at?: string | null;
          signed_at?: string | null;
          expires_at?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      employee_certifications: {
        Row: {
          id: string;
          organization_id: string;
          certification_id: string;
          employee_id: string;
          issued_at: string;
          expires_at: string;
          certificate_key: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          certification_id?: string | null;
          employee_id?: string | null;
          issued_at?: string | null;
          expires_at?: string | null;
          certificate_key?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          certification_id?: string | null;
          employee_id?: string | null;
          issued_at?: string | null;
          expires_at?: string | null;
          certificate_key?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      employee_files: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          name: string;
          storage_key: string;
          mime_type: string;
          size_bytes: number;
          category: string;
          uploaded_by: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          name?: string | null;
          storage_key?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          category?: string | null;
          uploaded_by?: string | null;
          expires_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          name?: string | null;
          storage_key?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          category?: string | null;
          uploaded_by?: string | null;
          expires_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      employees: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          employee_number: string;
          first_name: string;
          last_name: string;
          preferred_name: string;
          work_email: string;
          personal_email: string;
          phone: string;
          date_of_birth: string;
          pronouns: string;
          avatar_url: string;
          department_id: string;
          job_title_id: string;
          manager_id: string;
          location_id: string;
          employment_type: string;
          status: string;
          start_date: string;
          end_date: string;
          emergency_contact: Json;
          custom_fields: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string;
          email: string;
          department: string;
          role: string;
          title: string;
          location: string;
          source_tag: string;
          employment_status: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          employee_number?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          preferred_name?: string | null;
          work_email?: string | null;
          personal_email?: string | null;
          phone?: string | null;
          date_of_birth?: string | null;
          pronouns?: string | null;
          avatar_url?: string | null;
          department_id?: string | null;
          job_title_id?: string | null;
          manager_id?: string | null;
          location_id?: string | null;
          employment_type?: string | null;
          status?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          emergency_contact?: Json | null;
          custom_fields?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          department?: string | null;
          role?: string | null;
          title?: string | null;
          location?: string | null;
          source_tag?: string | null;
          employment_status?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          employee_number?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          preferred_name?: string | null;
          work_email?: string | null;
          personal_email?: string | null;
          phone?: string | null;
          date_of_birth?: string | null;
          pronouns?: string | null;
          avatar_url?: string | null;
          department_id?: string | null;
          job_title_id?: string | null;
          manager_id?: string | null;
          location_id?: string | null;
          employment_type?: string | null;
          status?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          emergency_contact?: Json | null;
          custom_fields?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          department?: string | null;
          role?: string | null;
          title?: string | null;
          location?: string | null;
          source_tag?: string | null;
          employment_status?: string | null;
        };
        Relationships: [];
      };

      employment_history: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          department_id: string;
          job_title_id: string;
          manager_id: string;
          employment_type: string;
          effective_from: string;
          effective_to: string;
          reason: string;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          department_id?: string | null;
          job_title_id?: string | null;
          manager_id?: string | null;
          employment_type?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          reason?: string | null;
          notes?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          department_id?: string | null;
          job_title_id?: string | null;
          manager_id?: string | null;
          employment_type?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          reason?: string | null;
          notes?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      equity_grants: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          employee_name: string;
          grant_type: string;
          quantity: number;
          strike_price: number;
          vesting_months: number;
          status: string;
          created_at: string;
          grant_date: string;
          currency_code: string;
          vesting_start_date: string;
          vesting_end_date: string;
          cliff_months: number;
          metadata: Json;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          employee_name?: string | null;
          grant_type?: string | null;
          quantity?: number | null;
          strike_price?: number | null;
          vesting_months?: number | null;
          status?: string | null;
          created_at?: string | null;
          grant_date?: string | null;
          currency_code?: string | null;
          vesting_start_date?: string | null;
          vesting_end_date?: string | null;
          cliff_months?: number | null;
          metadata?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          employee_name?: string | null;
          grant_type?: string | null;
          quantity?: number | null;
          strike_price?: number | null;
          vesting_months?: number | null;
          status?: string | null;
          created_at?: string | null;
          grant_date?: string | null;
          currency_code?: string | null;
          vesting_start_date?: string | null;
          vesting_end_date?: string | null;
          cliff_months?: number | null;
          metadata?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      equity_vesting_events: {
        Row: {
          id: string;
          organization_id: string;
          equity_grant_id: string;
          vesting_date: string;
          quantity: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          equity_grant_id?: string | null;
          vesting_date?: string | null;
          quantity?: number | null;
          status?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          equity_grant_id?: string | null;
          vesting_date?: string | null;
          quantity?: number | null;
          status?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      expense_reports: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          employee_name: string;
          merchant: string;
          category: string;
          amount: number;
          currency: string;
          status: string;
          created_at: string;
          expense_date: string;
          currency_code: string;
          receipt_key: string;
          policy_flags: Json;
          approved_by: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          employee_name?: string | null;
          merchant?: string | null;
          category?: string | null;
          amount?: number | null;
          currency?: string | null;
          status?: string | null;
          created_at?: string | null;
          expense_date?: string | null;
          currency_code?: string | null;
          receipt_key?: string | null;
          policy_flags?: Json | null;
          approved_by?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          employee_name?: string | null;
          merchant?: string | null;
          category?: string | null;
          amount?: number | null;
          currency?: string | null;
          status?: string | null;
          created_at?: string | null;
          expense_date?: string | null;
          currency_code?: string | null;
          receipt_key?: string | null;
          policy_flags?: Json | null;
          approved_by?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      external_webhook_logs: {
        Row: {
          id: string;
          organization_id: string;
          direction: string;
          event_type: string;
          endpoint: string;
          status_code: number;
          payload_hash: string;
          error_message: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          direction?: string | null;
          event_type?: string | null;
          endpoint?: string | null;
          status_code?: number | null;
          payload_hash?: string | null;
          error_message?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          direction?: string | null;
          event_type?: string | null;
          endpoint?: string | null;
          status_code?: number | null;
          payload_hash?: string | null;
          error_message?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      feedback_notes: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          author_id: string;
          sentiment: string;
          visibility: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          author_id?: string | null;
          sentiment?: string | null;
          visibility?: string | null;
          body?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          author_id?: string | null;
          sentiment?: string | null;
          visibility?: string | null;
          body?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      goal_check_ins: {
        Row: {
          id: string;
          organization_id: string;
          goal_id: string;
          employee_id: string;
          created_by: string;
          check_in_date: string;
          current_value: number;
          progress_percent: number;
          confidence: string;
          blockers: string;
          next_steps: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          goal_id?: string | null;
          employee_id?: string | null;
          created_by?: string | null;
          check_in_date?: string | null;
          current_value?: number | null;
          progress_percent?: number | null;
          confidence?: string | null;
          blockers?: string | null;
          next_steps?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          goal_id?: string | null;
          employee_id?: string | null;
          created_by?: string | null;
          check_in_date?: string | null;
          current_value?: number | null;
          progress_percent?: number | null;
          confidence?: string | null;
          blockers?: string | null;
          next_steps?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      goals: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          parent_goal_id: string;
          performance_cycle_id: string;
          title: string;
          description: string;
          metric_type: string;
          target_value: number;
          current_value: number;
          progress_percent: number;
          due_date: string;
          status: string;
          created_at: string;
          updated_at: string;
          employee_name: string;
          objective: string;
          progress: number;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          parent_goal_id?: string | null;
          performance_cycle_id?: string | null;
          title?: string | null;
          description?: string | null;
          metric_type?: string | null;
          target_value?: number | null;
          current_value?: number | null;
          progress_percent?: number | null;
          due_date?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          employee_name?: string | null;
          objective?: string | null;
          progress?: number | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          parent_goal_id?: string | null;
          performance_cycle_id?: string | null;
          title?: string | null;
          description?: string | null;
          metric_type?: string | null;
          target_value?: number | null;
          current_value?: number | null;
          progress_percent?: number | null;
          due_date?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          employee_name?: string | null;
          objective?: string | null;
          progress?: number | null;
        };
        Relationships: [];
      };

      health_logs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          sleep_hours: number;
          steps: number;
          calories: number;
          protein: number;
          water_intake: number;
          mood: string;
          created_at: string;
          weight: number;
          workout_done: boolean;
          workout_type: string;
        };
        Insert: {
          id?: string | null;
          user_id?: string | null;
          date?: string | null;
          sleep_hours?: number | null;
          steps?: number | null;
          calories?: number | null;
          protein?: number | null;
          water_intake?: number | null;
          mood?: string | null;
          created_at?: string | null;
          weight?: number | null;
          workout_done?: boolean | null;
          workout_type?: string | null;
        };
        Update: {
          id?: string | null;
          user_id?: string | null;
          date?: string | null;
          sleep_hours?: number | null;
          steps?: number | null;
          calories?: number | null;
          protein?: number | null;
          water_intake?: number | null;
          mood?: string | null;
          created_at?: string | null;
          weight?: number | null;
          workout_done?: boolean | null;
          workout_type?: string | null;
        };
        Relationships: [];
      };

      integration_statuses: {
        Row: {
          id: string;
          organization_id: string;
          integration: string;
          connection_mode: string;
          status: string;
          credential_id: string;
          external_account_label: string;
          granted_scopes: Json;
          settings: Json;
          last_sync_at: string;
          last_error: string;
          connected_by: string;
          connected_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          integration?: string | null;
          connection_mode?: string | null;
          status?: string | null;
          credential_id?: string | null;
          external_account_label?: string | null;
          granted_scopes?: Json | null;
          settings?: Json | null;
          last_sync_at?: string | null;
          last_error?: string | null;
          connected_by?: string | null;
          connected_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          integration?: string | null;
          connection_mode?: string | null;
          status?: string | null;
          credential_id?: string | null;
          external_account_label?: string | null;
          granted_scopes?: Json | null;
          settings?: Json | null;
          last_sync_at?: string | null;
          last_error?: string | null;
          connected_by?: string | null;
          connected_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      interview_feedback: {
        Row: {
          id: string;
          organization_id: string;
          interview_id: string;
          interviewer_id: string;
          rating: number;
          recommendation: string;
          answers: Json;
          strengths: string;
          concerns: string;
          submitted_at: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          interview_id?: string | null;
          interviewer_id?: string | null;
          rating?: number | null;
          recommendation?: string | null;
          answers?: Json | null;
          strengths?: string | null;
          concerns?: string | null;
          submitted_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          interview_id?: string | null;
          interviewer_id?: string | null;
          rating?: number | null;
          recommendation?: string | null;
          answers?: Json | null;
          strengths?: string | null;
          concerns?: string | null;
          submitted_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      interview_participants: {
        Row: {
          id: string;
          organization_id: string;
          interview_id: string;
          employee_id: string;
          external_email: string;
          role: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          interview_id?: string | null;
          employee_id?: string | null;
          external_email?: string | null;
          role?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          interview_id?: string | null;
          employee_id?: string | null;
          external_email?: string | null;
          role?: string | null;
        };
        Relationships: [];
      };

      interviews: {
        Row: {
          id: string;
          organization_id: string;
          application_id: string;
          title: string;
          interview_type: string;
          status: string;
          scheduled_start: string;
          scheduled_end: string;
          meeting_url: string;
          timezone: string;
          scorecard: Json;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          application_id?: string | null;
          title?: string | null;
          interview_type?: string | null;
          status?: string | null;
          scheduled_start?: string | null;
          scheduled_end?: string | null;
          meeting_url?: string | null;
          timezone?: string | null;
          scorecard?: Json | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          application_id?: string | null;
          title?: string | null;
          interview_type?: string | null;
          status?: string | null;
          scheduled_start?: string | null;
          scheduled_end?: string | null;
          meeting_url?: string | null;
          timezone?: string | null;
          scorecard?: Json | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      job_openings: {
        Row: {
          id: string;
          organization_id: string;
          department_id: string;
          job_title_id: string;
          hiring_manager_id: string;
          recruiter_id: string;
          requisition_code: string;
          title: string;
          description: string;
          requirements: Json;
          skills: Json;
          employment_type: string;
          location_id: string;
          remote_policy: string;
          min_salary: number;
          max_salary: number;
          currency_code: string;
          target_hire_date: string;
          status: string;
          published_at: string;
          closed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          department_id?: string | null;
          job_title_id?: string | null;
          hiring_manager_id?: string | null;
          recruiter_id?: string | null;
          requisition_code?: string | null;
          title?: string | null;
          description?: string | null;
          requirements?: Json | null;
          skills?: Json | null;
          employment_type?: string | null;
          location_id?: string | null;
          remote_policy?: string | null;
          min_salary?: number | null;
          max_salary?: number | null;
          currency_code?: string | null;
          target_hire_date?: string | null;
          status?: string | null;
          published_at?: string | null;
          closed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          department_id?: string | null;
          job_title_id?: string | null;
          hiring_manager_id?: string | null;
          recruiter_id?: string | null;
          requisition_code?: string | null;
          title?: string | null;
          description?: string | null;
          requirements?: Json | null;
          skills?: Json | null;
          employment_type?: string | null;
          location_id?: string | null;
          remote_policy?: string | null;
          min_salary?: number | null;
          max_salary?: number | null;
          currency_code?: string | null;
          target_hire_date?: string | null;
          status?: string | null;
          published_at?: string | null;
          closed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      job_postings: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          department: string;
          location: string;
          status: string;
          description: string;
          created_at: string;
          source_tag: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          department?: string | null;
          location?: string | null;
          status?: string | null;
          description?: string | null;
          created_at?: string | null;
          source_tag?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          department?: string | null;
          location?: string | null;
          status?: string | null;
          description?: string | null;
          created_at?: string | null;
          source_tag?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      job_titles: {
        Row: {
          id: string;
          organization_id: string;
          department_id: string;
          name: string;
          level: string;
          job_family: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          department_id?: string | null;
          name?: string | null;
          level?: string | null;
          job_family?: string | null;
          description?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          department_id?: string | null;
          name?: string | null;
          level?: string | null;
          job_family?: string | null;
          description?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      leads: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          status: string;
          ai_match_score: number;
          assigned_to: string;
          metadata: Json;
          updated_at: string;
          organization_id: string;
          first_name: string;
          last_name: string;
          company: string;
          title: string;
          source: string;
          score: number;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          full_name?: string | null;
          email?: string | null;
          status?: string | null;
          ai_match_score?: number | null;
          assigned_to?: string | null;
          metadata?: Json | null;
          updated_at?: string | null;
          organization_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          company?: string | null;
          title?: string | null;
          source?: string | null;
          score?: number | null;
          owner_id?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          full_name?: string | null;
          email?: string | null;
          status?: string | null;
          ai_match_score?: number | null;
          assigned_to?: string | null;
          metadata?: Json | null;
          updated_at?: string | null;
          organization_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          company?: string | null;
          title?: string | null;
          source?: string | null;
          score?: number | null;
          owner_id?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      learning_courses: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          category: string;
          level: string;
          estimated_minutes: number;
          enrolled: number;
          completion_rate: number;
          created_at: string;
          description: string;
          cover_image_key: string;
          status: string;
          created_by: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          category?: string | null;
          level?: string | null;
          estimated_minutes?: number | null;
          enrolled?: number | null;
          completion_rate?: number | null;
          created_at?: string | null;
          description?: string | null;
          cover_image_key?: string | null;
          status?: string | null;
          created_by?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          category?: string | null;
          level?: string | null;
          estimated_minutes?: number | null;
          enrolled?: number | null;
          completion_rate?: number | null;
          created_at?: string | null;
          description?: string | null;
          cover_image_key?: string | null;
          status?: string | null;
          created_by?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      learning_enrollments: {
        Row: {
          id: string;
          organization_id: string;
          course_id: string;
          employee_id: string;
          assigned_by: string;
          due_date: string;
          status: string;
          progress_percent: number;
          completed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          course_id?: string | null;
          employee_id?: string | null;
          assigned_by?: string | null;
          due_date?: string | null;
          status?: string | null;
          progress_percent?: number | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          course_id?: string | null;
          employee_id?: string | null;
          assigned_by?: string | null;
          due_date?: string | null;
          status?: string | null;
          progress_percent?: number | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      learning_lesson_progress: {
        Row: {
          id: string;
          organization_id: string;
          enrollment_id: string;
          lesson_id: string;
          completed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          enrollment_id?: string | null;
          lesson_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          enrollment_id?: string | null;
          lesson_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      learning_lessons: {
        Row: {
          id: string;
          organization_id: string;
          course_id: string;
          title: string;
          content_html: string;
          content_url: string;
          duration_minutes: number;
          sort_order: number;
          is_required: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          course_id?: string | null;
          title?: string | null;
          content_html?: string | null;
          content_url?: string | null;
          duration_minutes?: number | null;
          sort_order?: number | null;
          is_required?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          course_id?: string | null;
          title?: string | null;
          content_html?: string | null;
          content_url?: string | null;
          duration_minutes?: number | null;
          sort_order?: number | null;
          is_required?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      learning_quiz_attempts: {
        Row: {
          id: string;
          organization_id: string;
          quiz_id: string;
          enrollment_id: string;
          employee_id: string;
          answers: Json;
          score: number;
          passed: boolean;
          submitted_at: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          quiz_id?: string | null;
          enrollment_id?: string | null;
          employee_id?: string | null;
          answers?: Json | null;
          score?: number | null;
          passed?: boolean | null;
          submitted_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          quiz_id?: string | null;
          enrollment_id?: string | null;
          employee_id?: string | null;
          answers?: Json | null;
          score?: number | null;
          passed?: boolean | null;
          submitted_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      learning_quiz_questions: {
        Row: {
          id: string;
          organization_id: string;
          quiz_id: string;
          prompt: string;
          question_type: string;
          choices: Json;
          correct_answer: Json;
          explanation: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          quiz_id?: string | null;
          prompt?: string | null;
          question_type?: string | null;
          choices?: Json | null;
          correct_answer?: Json | null;
          explanation?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          quiz_id?: string | null;
          prompt?: string | null;
          question_type?: string | null;
          choices?: Json | null;
          correct_answer?: Json | null;
          explanation?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      learning_quizzes: {
        Row: {
          id: string;
          organization_id: string;
          course_id: string;
          title: string;
          passing_score: number;
          max_attempts: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          course_id?: string | null;
          title?: string | null;
          passing_score?: number | null;
          max_attempts?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          course_id?: string | null;
          title?: string | null;
          passing_score?: number | null;
          max_attempts?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      leave_balances: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          leave_type_id: string;
          balance_year: number;
          opening_days: number;
          accrued_days: number;
          used_days: number;
          carried_days: number;
          updated_at: string;
          source_tag: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          leave_type_id?: string | null;
          balance_year?: number | null;
          opening_days?: number | null;
          accrued_days?: number | null;
          used_days?: number | null;
          carried_days?: number | null;
          updated_at?: string | null;
          source_tag?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          leave_type_id?: string | null;
          balance_year?: number | null;
          opening_days?: number | null;
          accrued_days?: number | null;
          used_days?: number | null;
          carried_days?: number | null;
          updated_at?: string | null;
          source_tag?: string | null;
        };
        Relationships: [];
      };

      leave_requests: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          leave_type_id: string;
          start_date: string;
          end_date: string;
          total_days: number;
          half_day: boolean;
          reason: string;
          attachment_key: string;
          status: string;
          approver_id: string;
          approver_note: string;
          decided_at: string;
          created_at: string;
          updated_at: string;
          employee_name: string;
          source_tag: string;
          type: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          leave_type_id?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          total_days?: number | null;
          half_day?: boolean | null;
          reason?: string | null;
          attachment_key?: string | null;
          status?: string | null;
          approver_id?: string | null;
          approver_note?: string | null;
          decided_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          employee_name?: string | null;
          source_tag?: string | null;
          type?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          leave_type_id?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          total_days?: number | null;
          half_day?: boolean | null;
          reason?: string | null;
          attachment_key?: string | null;
          status?: string | null;
          approver_id?: string | null;
          approver_note?: string | null;
          decided_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          employee_name?: string | null;
          source_tag?: string | null;
          type?: string | null;
        };
        Relationships: [];
      };

      leave_types: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          color: string;
          annual_allowance: number;
          requires_approval: boolean;
          requires_attachment: boolean;
          paid: boolean;
          rules: Json;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          code?: string | null;
          color?: string | null;
          annual_allowance?: number | null;
          requires_approval?: boolean | null;
          requires_attachment?: boolean | null;
          paid?: boolean | null;
          rules?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          code?: string | null;
          color?: string | null;
          annual_allowance?: number | null;
          requires_approval?: boolean | null;
          requires_attachment?: boolean | null;
          paid?: boolean | null;
          rules?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      locations: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          country_code: string;
          timezone: string;
          address: Json;
          is_remote: boolean;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          country_code?: string | null;
          timezone?: string | null;
          address?: Json | null;
          is_remote?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          country_code?: string | null;
          timezone?: string | null;
          address?: Json | null;
          is_remote?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      memberships: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          user_id?: string | null;
          organization_id?: string | null;
          role?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          user_id?: string | null;
          organization_id?: string | null;
          role?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      memory_storage_configs: {
        Row: {
          id: string;
          organization_id: string;
          vector_backend: string;
          context_window: number;
          encrypted_connection_value: string;
          connection_encryption_algorithm: string;
          connection_key_version: number;
          masked_connection_display: string;
          enabled: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          vector_backend?: string | null;
          context_window?: number | null;
          encrypted_connection_value?: string | null;
          connection_encryption_algorithm?: string | null;
          connection_key_version?: number | null;
          masked_connection_display?: string | null;
          enabled?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          vector_backend?: string | null;
          context_window?: number | null;
          encrypted_connection_value?: string | null;
          connection_encryption_algorithm?: string | null;
          connection_key_version?: number | null;
          masked_connection_display?: string | null;
          enabled?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      n8n_credentials: {
        Row: {
          id: string;
          n8n_id: string;
          name: string;
          type: string;
          last_synced: string;
        };
        Insert: {
          id?: string | null;
          n8n_id?: string | null;
          name?: string | null;
          type?: string | null;
          last_synced?: string | null;
        };
        Update: {
          id?: string | null;
          n8n_id?: string | null;
          name?: string | null;
          type?: string | null;
          last_synced?: string | null;
        };
        Relationships: [];
      };

      notifications: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          employee_id: string;
          channel: string;
          title: string;
          body: string;
          link: string;
          read_at: string;
          delivered_at: string;
          created_at: string;
          kind: string;
          description: string;
          read: boolean;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          employee_id?: string | null;
          channel?: string | null;
          title?: string | null;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          delivered_at?: string | null;
          created_at?: string | null;
          kind?: string | null;
          description?: string | null;
          read?: boolean | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          employee_id?: string | null;
          channel?: string | null;
          title?: string | null;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          delivered_at?: string | null;
          created_at?: string | null;
          kind?: string | null;
          description?: string | null;
          read?: boolean | null;
        };
        Relationships: [];
      };

      offboarding_cases: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          employee_name: string;
          exit_date: string;
          status: string;
          tasks_done: number;
          tasks_total: number;
          created_at: string;
          initiated_by: string;
          effective_date: string;
          reason: string;
          exit_interview: Json;
          notes: string;
          completed_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          employee_name?: string | null;
          exit_date?: string | null;
          status?: string | null;
          tasks_done?: number | null;
          tasks_total?: number | null;
          created_at?: string | null;
          initiated_by?: string | null;
          effective_date?: string | null;
          reason?: string | null;
          exit_interview?: Json | null;
          notes?: string | null;
          completed_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          employee_name?: string | null;
          exit_date?: string | null;
          status?: string | null;
          tasks_done?: number | null;
          tasks_total?: number | null;
          created_at?: string | null;
          initiated_by?: string | null;
          effective_date?: string | null;
          reason?: string | null;
          exit_interview?: Json | null;
          notes?: string | null;
          completed_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      offboarding_tasks: {
        Row: {
          id: string;
          organization_id: string;
          offboarding_case_id: string;
          owner_employee_id: string;
          title: string;
          description: string;
          due_date: string;
          status: string;
          sort_order: number;
          completed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          offboarding_case_id?: string | null;
          owner_employee_id?: string | null;
          title?: string | null;
          description?: string | null;
          due_date?: string | null;
          status?: string | null;
          sort_order?: number | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          offboarding_case_id?: string | null;
          owner_employee_id?: string | null;
          title?: string | null;
          description?: string | null;
          due_date?: string | null;
          status?: string | null;
          sort_order?: number | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      onboarding_document_signing_requests: {
        Row: {
          id: string;
          organization_id: string;
          enrollment_id: string;
          document_id: string;
          employee_id: string;
          requested_by: string;
          provider: string;
          provider_envelope_id: string;
          status: string;
          signing_url: string;
          expires_at: string;
          signed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          enrollment_id?: string | null;
          document_id?: string | null;
          employee_id?: string | null;
          requested_by?: string | null;
          provider?: string | null;
          provider_envelope_id?: string | null;
          status?: string | null;
          signing_url?: string | null;
          expires_at?: string | null;
          signed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          enrollment_id?: string | null;
          document_id?: string | null;
          employee_id?: string | null;
          requested_by?: string | null;
          provider?: string | null;
          provider_envelope_id?: string | null;
          status?: string | null;
          signing_url?: string | null;
          expires_at?: string | null;
          signed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      onboarding_enrollments: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          program_id: string;
          manager_id: string;
          buddy_id: string;
          start_date: string;
          target_completion_date: string;
          status: string;
          progress_percent: number;
          notes: string;
          completed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          program_id?: string | null;
          manager_id?: string | null;
          buddy_id?: string | null;
          start_date?: string | null;
          target_completion_date?: string | null;
          status?: string | null;
          progress_percent?: number | null;
          notes?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          employee_id?: string | null;
          program_id?: string | null;
          manager_id?: string | null;
          buddy_id?: string | null;
          start_date?: string | null;
          target_completion_date?: string | null;
          status?: string | null;
          progress_percent?: number | null;
          notes?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      onboarding_programs: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string;
          target_days: number;
          is_default: boolean;
          template_steps: Json;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          description?: string | null;
          target_days?: number | null;
          is_default?: boolean | null;
          template_steps?: Json | null;
          is_active?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          description?: string | null;
          target_days?: number | null;
          is_default?: boolean | null;
          template_steps?: Json | null;
          is_active?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      onboarding_tasks: {
        Row: {
          id: string;
          organization_id: string;
          enrollment_id: string;
          owner_employee_id: string;
          title: string;
          description: string;
          due_date: string;
          status: string;
          sort_order: number;
          metadata: Json;
          completed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          enrollment_id?: string | null;
          owner_employee_id?: string | null;
          title?: string | null;
          description?: string | null;
          due_date?: string | null;
          status?: string | null;
          sort_order?: number | null;
          metadata?: Json | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          enrollment_id?: string | null;
          owner_employee_id?: string | null;
          title?: string | null;
          description?: string | null;
          due_date?: string | null;
          status?: string | null;
          sort_order?: number | null;
          metadata?: Json | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role_id: string;
          status: string;
          invited_by: string;
          joined_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          role_id?: string | null;
          status?: string | null;
          invited_by?: string | null;
          joined_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          role_id?: string | null;
          status?: string | null;
          invited_by?: string | null;
          joined_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      organization_settings: {
        Row: {
          id: string;
          organization_id: string;
          profile: Json;
          department_defaults: Json;
          branding: Json;
          default_theme: string;
          default_density: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          profile?: Json | null;
          department_defaults?: Json | null;
          branding?: Json | null;
          default_theme?: string | null;
          default_density?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          profile?: Json | null;
          department_defaults?: Json | null;
          branding?: Json | null;
          default_theme?: string | null;
          default_density?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      organizations: {
        Row: {
          id: string;
          name: string;
          legal_name: string;
          slug: string;
          logo_url: string;
          primary_color: string;
          timezone: string;
          locale: string;
          currency_code: string;
          work_week: number[];
          settings: Json;
          plan_code: string;
          trial_ends_at: string;
          created_at: string;
          updated_at: string;
          deleted_at: string;
          plan: string;
          billing_status: string;
        };
        Insert: {
          id?: string | null;
          name?: string | null;
          legal_name?: string | null;
          slug?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          timezone?: string | null;
          locale?: string | null;
          currency_code?: string | null;
          work_week?: number[] | null;
          settings?: Json | null;
          plan_code?: string | null;
          trial_ends_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          deleted_at?: string | null;
          plan?: string | null;
          billing_status?: string | null;
        };
        Update: {
          id?: string | null;
          name?: string | null;
          legal_name?: string | null;
          slug?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          timezone?: string | null;
          locale?: string | null;
          currency_code?: string | null;
          work_week?: number[] | null;
          settings?: Json | null;
          plan_code?: string | null;
          trial_ends_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          deleted_at?: string | null;
          plan?: string | null;
          billing_status?: string | null;
        };
        Relationships: [];
      };

      payroll_cycles: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          period_start: string;
          period_end: string;
          pay_date: string;
          currency_code: string;
          status: string;
          approved_by: string;
          approved_at: string;
          paid_at: string;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          pay_date?: string | null;
          currency_code?: string | null;
          status?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          pay_date?: string | null;
          currency_code?: string | null;
          status?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      payroll_entries: {
        Row: {
          id: string;
          organization_id: string;
          payroll_cycle_id: string;
          employee_id: string;
          gross_pay: number;
          taxable_pay: number;
          total_deductions: number;
          net_pay: number;
          currency_code: string;
          payment_status: string;
          bank_reference: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          payroll_cycle_id?: string | null;
          employee_id?: string | null;
          gross_pay?: number | null;
          taxable_pay?: number | null;
          total_deductions?: number | null;
          net_pay?: number | null;
          currency_code?: string | null;
          payment_status?: string | null;
          bank_reference?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          payroll_cycle_id?: string | null;
          employee_id?: string | null;
          gross_pay?: number | null;
          taxable_pay?: number | null;
          total_deductions?: number | null;
          net_pay?: number | null;
          currency_code?: string | null;
          payment_status?: string | null;
          bank_reference?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      payroll_line_items: {
        Row: {
          id: string;
          organization_id: string;
          payroll_entry_id: string;
          line_type: string;
          code: string;
          label: string;
          amount: number;
          taxable: boolean;
          metadata: Json;
          created_at: string;
          employee_name: string;
          gross_pay: number;
          deductions: number;
          net_pay: number;
          source_tag: string;
          payroll_run_id: string;
          employee_id: string;
          currency: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          payroll_entry_id?: string | null;
          line_type?: string | null;
          code?: string | null;
          label?: string | null;
          amount?: number | null;
          taxable?: boolean | null;
          metadata?: Json | null;
          created_at?: string | null;
          employee_name?: string | null;
          gross_pay?: number | null;
          deductions?: number | null;
          net_pay?: number | null;
          source_tag?: string | null;
          payroll_run_id?: string | null;
          employee_id?: string | null;
          currency?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          payroll_entry_id?: string | null;
          line_type?: string | null;
          code?: string | null;
          label?: string | null;
          amount?: number | null;
          taxable?: boolean | null;
          metadata?: Json | null;
          created_at?: string | null;
          employee_name?: string | null;
          gross_pay?: number | null;
          deductions?: number | null;
          net_pay?: number | null;
          source_tag?: string | null;
          payroll_run_id?: string | null;
          employee_id?: string | null;
          currency?: string | null;
        };
        Relationships: [];
      };

      payroll_runs: {
        Row: {
          id: string;
          organization_id: string;
          period_start: string;
          period_end: string;
          status: string;
          currency: string;
          created_at: string;
          total_gross: number;
          total_deductions: number;
          total_net: number;
          executed_by: string;
          executed_at: string;
          source_tag: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          status?: string | null;
          currency?: string | null;
          created_at?: string | null;
          total_gross?: number | null;
          total_deductions?: number | null;
          total_net?: number | null;
          executed_by?: string | null;
          executed_at?: string | null;
          source_tag?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          status?: string | null;
          currency?: string | null;
          created_at?: string | null;
          total_gross?: number | null;
          total_deductions?: number | null;
          total_net?: number | null;
          executed_by?: string | null;
          executed_at?: string | null;
          source_tag?: string | null;
        };
        Relationships: [];
      };

      performance_calibration_records: {
        Row: {
          id: string;
          organization_id: string;
          performance_cycle_id: string;
          employee_id: string;
          proposed_rating: number;
          calibrated_rating: number;
          rationale: string;
          calibration_status: string;
          calibrated_by: string;
          calibrated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          performance_cycle_id?: string | null;
          employee_id?: string | null;
          proposed_rating?: number | null;
          calibrated_rating?: number | null;
          rationale?: string | null;
          calibration_status?: string | null;
          calibrated_by?: string | null;
          calibrated_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          performance_cycle_id?: string | null;
          employee_id?: string | null;
          proposed_rating?: number | null;
          calibrated_rating?: number | null;
          rationale?: string | null;
          calibration_status?: string | null;
          calibrated_by?: string | null;
          calibrated_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      performance_cycles: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          start_date: string;
          end_date: string;
          self_review_due_at: string;
          manager_review_due_at: string;
          status: string;
          settings: Json;
          created_at: string;
          participants: number;
          description: string;
          calibration_due_at: string;
          published_at: string;
          created_by: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          self_review_due_at?: string | null;
          manager_review_due_at?: string | null;
          status?: string | null;
          settings?: Json | null;
          created_at?: string | null;
          participants?: number | null;
          description?: string | null;
          calibration_due_at?: string | null;
          published_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          self_review_due_at?: string | null;
          manager_review_due_at?: string | null;
          status?: string | null;
          settings?: Json | null;
          created_at?: string | null;
          participants?: number | null;
          description?: string | null;
          calibration_due_at?: string | null;
          published_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };

      performance_feedback_requests: {
        Row: {
          id: string;
          organization_id: string;
          performance_cycle_id: string;
          performance_review_id: string;
          subject_employee_id: string;
          requested_by: string;
          recipient_employee_id: string;
          recipient_email: string;
          relationship: string;
          visibility: string;
          questions: Json;
          status: string;
          due_at: string;
          token_hash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          performance_cycle_id?: string | null;
          performance_review_id?: string | null;
          subject_employee_id?: string | null;
          requested_by?: string | null;
          recipient_employee_id?: string | null;
          recipient_email?: string | null;
          relationship?: string | null;
          visibility?: string | null;
          questions?: Json | null;
          status?: string | null;
          due_at?: string | null;
          token_hash?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          performance_cycle_id?: string | null;
          performance_review_id?: string | null;
          subject_employee_id?: string | null;
          requested_by?: string | null;
          recipient_employee_id?: string | null;
          recipient_email?: string | null;
          relationship?: string | null;
          visibility?: string | null;
          questions?: Json | null;
          status?: string | null;
          due_at?: string | null;
          token_hash?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      performance_feedback_responses: {
        Row: {
          id: string;
          organization_id: string;
          feedback_request_id: string;
          respondent_employee_id: string;
          respondent_email: string;
          overall_rating: number;
          answers: Json;
          strengths: string;
          growth_areas: string;
          submitted_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          feedback_request_id?: string | null;
          respondent_employee_id?: string | null;
          respondent_email?: string | null;
          overall_rating?: number | null;
          answers?: Json | null;
          strengths?: string | null;
          growth_areas?: string | null;
          submitted_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          feedback_request_id?: string | null;
          respondent_employee_id?: string | null;
          respondent_email?: string | null;
          overall_rating?: number | null;
          answers?: Json | null;
          strengths?: string | null;
          growth_areas?: string | null;
          submitted_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      performance_review_answers: {
        Row: {
          id: string;
          organization_id: string;
          performance_review_id: string;
          question_key: string;
          answer: string;
          rating: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          performance_review_id?: string | null;
          question_key?: string | null;
          answer?: string | null;
          rating?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          performance_review_id?: string | null;
          question_key?: string | null;
          answer?: string | null;
          rating?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      performance_reviews: {
        Row: {
          id: string;
          organization_id: string;
          performance_cycle_id: string;
          employee_id: string;
          reviewer_id: string;
          review_type: string;
          status: string;
          overall_rating: number;
          summary: string;
          ai_summary: string;
          submitted_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          performance_cycle_id?: string | null;
          employee_id?: string | null;
          reviewer_id?: string | null;
          review_type?: string | null;
          status?: string | null;
          overall_rating?: number | null;
          summary?: string | null;
          ai_summary?: string | null;
          submitted_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          performance_cycle_id?: string | null;
          employee_id?: string | null;
          reviewer_id?: string | null;
          review_type?: string | null;
          status?: string | null;
          overall_rating?: number | null;
          summary?: string | null;
          ai_summary?: string | null;
          submitted_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      policy_acknowledgements: {
        Row: {
          id: string;
          organization_id: string;
          document_id: string;
          employee_id: string;
          policy_name: string;
          policy_version: string;
          acknowledged_at: string;
          acknowledgement_ip: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          document_id?: string | null;
          employee_id?: string | null;
          policy_name?: string | null;
          policy_version?: string | null;
          acknowledged_at?: string | null;
          acknowledgement_ip?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          document_id?: string | null;
          employee_id?: string | null;
          policy_name?: string | null;
          policy_version?: string | null;
          acknowledged_at?: string | null;
          acknowledgement_ip?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: string;
          department: string;
          employment_type: string;
          ai_score: number;
          attrition_risk: string;
          created_at: string;
          avatar_url: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          full_name?: string | null;
          email?: string | null;
          role?: string | null;
          department?: string | null;
          employment_type?: string | null;
          ai_score?: number | null;
          attrition_risk?: string | null;
          created_at?: string | null;
          avatar_url?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          full_name?: string | null;
          email?: string | null;
          role?: string | null;
          department?: string | null;
          employment_type?: string | null;
          ai_score?: number | null;
          attrition_risk?: string | null;
          created_at?: string | null;
          avatar_url?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      pulse_responses: {
        Row: {
          id: string;
          organization_id: string;
          survey_id: string;
          employee_id: string;
          anonymous_token_hash: string;
          answers: Json;
          submitted_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          survey_id?: string | null;
          employee_id?: string | null;
          anonymous_token_hash?: string | null;
          answers?: Json | null;
          submitted_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          survey_id?: string | null;
          employee_id?: string | null;
          anonymous_token_hash?: string | null;
          answers?: Json | null;
          submitted_at?: string | null;
        };
        Relationships: [];
      };

      pulse_surveys: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          anonymous: boolean;
          status: string;
          responses: number;
          enps: number;
          created_at: string;
          description: string;
          created_by: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          anonymous?: boolean | null;
          status?: string | null;
          responses?: number | null;
          enps?: number | null;
          created_at?: string | null;
          description?: string | null;
          created_by?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          title?: string | null;
          anonymous?: boolean | null;
          status?: string | null;
          responses?: number | null;
          enps?: number | null;
          created_at?: string | null;
          description?: string | null;
          created_by?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      raw_health_data: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          sleep: number;
          steps: number;
          calories: number;
          weight: number;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          user_id?: string | null;
          date?: string | null;
          sleep?: number | null;
          steps?: number | null;
          calories?: number | null;
          weight?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          user_id?: string | null;
          date?: string | null;
          sleep?: number | null;
          steps?: number | null;
          calories?: number | null;
          weight?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      report_exports: {
        Row: {
          id: string;
          organization_id: string;
          requested_by: string;
          report_type: string;
          format: string;
          filters: Json;
          storage_key: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          requested_by?: string | null;
          report_type?: string | null;
          format?: string | null;
          filters?: Json | null;
          storage_key?: string | null;
          expires_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          requested_by?: string | null;
          report_type?: string | null;
          format?: string | null;
          filters?: Json | null;
          storage_key?: string | null;
          expires_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      resumes: {
        Row: {
          id: string;
          organization_id: string;
          candidate_id: string;
          storage_key: string;
          filename: string;
          parsed_text: string;
          parsed_data: Json;
          parser_version: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          candidate_id?: string | null;
          storage_key?: string | null;
          filename?: string | null;
          parsed_text?: string | null;
          parsed_data?: Json | null;
          parser_version?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          candidate_id?: string | null;
          storage_key?: string | null;
          filename?: string | null;
          parsed_text?: string | null;
          parsed_data?: Json | null;
          parser_version?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      roles: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          description: string;
          is_system: boolean;
          permissions: Json;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          code?: string | null;
          name?: string | null;
          description?: string | null;
          is_system?: boolean | null;
          permissions?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          code?: string | null;
          name?: string | null;
          description?: string | null;
          is_system?: boolean | null;
          permissions?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      scheduled_jobs: {
        Row: {
          id: string;
          organization_id: string;
          job_type: string;
          payload: Json;
          run_at: string;
          status: string;
          locked_by: string;
          completed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          job_type?: string | null;
          payload?: Json | null;
          run_at?: string | null;
          status?: string | null;
          locked_by?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          job_type?: string | null;
          payload?: Json | null;
          run_at?: string | null;
          status?: string | null;
          locked_by?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      settings_audit_logs: {
        Row: {
          id: number;
          organization_id: string;
          actor_user_id: string;
          action: string;
          resource_type: string;
          resource_id: string;
          field_name: string;
          old_value: Json;
          new_value: Json;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: number | null;
          organization_id?: string | null;
          actor_user_id?: string | null;
          action?: string | null;
          resource_type?: string | null;
          resource_id?: string | null;
          field_name?: string | null;
          old_value?: Json | null;
          new_value?: Json | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: number | null;
          organization_id?: string | null;
          actor_user_id?: string | null;
          action?: string | null;
          resource_type?: string | null;
          resource_id?: string | null;
          field_name?: string | null;
          old_value?: Json | null;
          new_value?: Json | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      system_audit_logs: {
        Row: {
          id: number;
          organization_id: string;
          actor_user_id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          before_state: Json;
          after_state: Json;
          ip_address: string;
          user_agent: string;
          created_at: string;
        };
        Insert: {
          id?: number | null;
          organization_id?: string | null;
          actor_user_id?: string | null;
          action?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: number | null;
          organization_id?: string | null;
          actor_user_id?: string | null;
          action?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      talent_assessments: {
        Row: {
          id: string;
          organization_id: string;
          performance_cycle_id: string;
          employee_id: string;
          performance_rating: number;
          potential_rating: number;
          readiness: string;
          retention_risk: string;
          calibration_note: string;
          assessed_by: string;
          assessed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          performance_cycle_id?: string | null;
          employee_id?: string | null;
          performance_rating?: number | null;
          potential_rating?: number | null;
          readiness?: string | null;
          retention_risk?: string | null;
          calibration_note?: string | null;
          assessed_by?: string | null;
          assessed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          performance_cycle_id?: string | null;
          employee_id?: string | null;
          performance_rating?: number | null;
          potential_rating?: number | null;
          readiness?: string | null;
          retention_risk?: string | null;
          calibration_note?: string | null;
          assessed_by?: string | null;
          assessed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      theme_preferences: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          theme: string;
          density: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          theme?: string | null;
          density?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          user_id?: string | null;
          theme?: string | null;
          density?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      user_goals: {
        Row: {
          id: string;
          user_id: string;
          target_weight: number;
          daily_steps: number;
          sleep_goal: number;
          calorie_goal: number;
          protein_goal: number;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          user_id?: string | null;
          target_weight?: number | null;
          daily_steps?: number | null;
          sleep_goal?: number | null;
          calorie_goal?: number | null;
          protein_goal?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          user_id?: string | null;
          target_weight?: number | null;
          daily_steps?: number | null;
          sleep_goal?: number | null;
          calorie_goal?: number | null;
          protein_goal?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      user_invoices: {
        Row: {
          id: number;
          invoice_number: string;
          issue_date: string;
          client_name: string;
          email: string;
          company_name: string;
          service_rendered: string;
          amount: number;
          status: string;
        };
        Insert: {
          id?: number | null;
          invoice_number?: string | null;
          issue_date?: string | null;
          client_name?: string | null;
          email?: string | null;
          company_name?: string | null;
          service_rendered?: string | null;
          amount?: number | null;
          status?: string | null;
        };
        Update: {
          id?: number | null;
          invoice_number?: string | null;
          issue_date?: string | null;
          client_name?: string | null;
          email?: string | null;
          company_name?: string | null;
          service_rendered?: string | null;
          amount?: number | null;
          status?: string | null;
        };
        Relationships: [];
      };

      users: {
        Row: {
          id: string;
          email: string;
          password_hash: string;
          full_name: string;
          avatar_url: string;
          phone: string;
          status: string;
          last_login_at: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string;
        };
        Insert: {
          id?: string | null;
          email?: string | null;
          password_hash?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          status?: string | null;
          last_login_at?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string | null;
          email?: string | null;
          password_hash?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          status?: string | null;
          last_login_at?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      webhook_deliveries: {
        Row: {
          id: string;
          subscription_id: string;
          event: string;
          status: string;
          status_code: number;
          response_body: string;
          attempted_at: string;
        };
        Insert: {
          id?: string | null;
          subscription_id?: string | null;
          event?: string | null;
          status?: string | null;
          status_code?: number | null;
          response_body?: string | null;
          attempted_at?: string | null;
        };
        Update: {
          id?: string | null;
          subscription_id?: string | null;
          event?: string | null;
          status?: string | null;
          status_code?: number | null;
          response_body?: string | null;
          attempted_at?: string | null;
        };
        Relationships: [];
      };

      webhook_subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          url: string;
          events: string[];
          secret: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          url?: string | null;
          events?: string[] | null;
          secret?: string | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          url?: string | null;
          events?: string[] | null;
          secret?: string | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      workflow_runs: {
        Row: {
          id: string;
          organization_id: string;
          workflow_id: string;
          status: string;
          trigger_payload: Json;
          output: Json;
          error_message: string;
          started_at: string;
          finished_at: string;
          created_at: string;
          executed_actions: Json;
          error: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          workflow_id?: string | null;
          status?: string | null;
          trigger_payload?: Json | null;
          output?: Json | null;
          error_message?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string | null;
          executed_actions?: Json | null;
          error?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          workflow_id?: string | null;
          status?: string | null;
          trigger_payload?: Json | null;
          output?: Json | null;
          error_message?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string | null;
          executed_actions?: Json | null;
          error?: string | null;
        };
        Relationships: [];
      };

      workflows: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string;
          trigger_type: string;
          trigger_config: Json;
          actions: Json;
          status: string;
          last_run_at: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          trigger_event: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          description?: string | null;
          trigger_type?: string | null;
          trigger_config?: Json | null;
          actions?: Json | null;
          status?: string | null;
          last_run_at?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          trigger_event?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          description?: string | null;
          trigger_type?: string | null;
          trigger_config?: Json | null;
          actions?: Json | null;
          status?: string | null;
          last_run_at?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          trigger_event?: string | null;
        };
        Relationships: [];
      };

      workforce_forecasts: {
        Row: {
          id: string;
          organization_id: string;
          scenario_id: string;
          period_date: string;
          headcount_forecast: number;
          budget_forecast: number;
          confidence_low: number;
          confidence_high: number;
          model_metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          scenario_id?: string | null;
          period_date?: string | null;
          headcount_forecast?: number | null;
          budget_forecast?: number | null;
          confidence_low?: number | null;
          confidence_high?: number | null;
          model_metadata?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          scenario_id?: string | null;
          period_date?: string | null;
          headcount_forecast?: number | null;
          budget_forecast?: number | null;
          confidence_low?: number | null;
          confidence_high?: number | null;
          model_metadata?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };

      workforce_scenarios: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          headcount_forecast: number;
          budget_forecast: number;
          status: string;
          created_at: string;
          assumptions: Json;
          created_by: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          headcount_forecast?: number | null;
          budget_forecast?: number | null;
          status?: string | null;
          created_at?: string | null;
          assumptions?: Json | null;
          created_by?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          name?: string | null;
          headcount_forecast?: number | null;
          budget_forecast?: number | null;
          status?: string | null;
          created_at?: string | null;
          assumptions?: Json | null;
          created_by?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      workspace_feature_flags: {
        Row: {
          id: string;
          organization_id: string;
          feature_key: string;
          enabled: boolean;
          config: Json;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | null;
          organization_id?: string | null;
          feature_key?: string | null;
          enabled?: boolean | null;
          config?: Json | null;
          updated_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          organization_id?: string | null;
          feature_key?: string | null;
          enabled?: boolean | null;
          config?: Json | null;
          updated_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      bootstrap_organization: {
        Args: { workspace_name: string; workspace_slug: string };
        Returns: Array<{
          organization_id: string;
          organization_name: string;
          organization_slug: string;
          role_code: string;
        }>;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
}
