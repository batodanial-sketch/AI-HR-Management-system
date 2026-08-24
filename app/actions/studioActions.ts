"use server";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/src/lib/supabase";
import type { Database, Json } from "@/lib/database.types";
import type { ActionResponse } from "./types";
import { actionFailure, actionSuccess } from "./types";
import { requireOrganizationContext, validationFailure } from "./_shared";
import { getLicenseState, requireEnterpriseTier } from "@/lib/license";
import {
  DEFAULT_WIDGETS,
  DEFAULT_DYNAMIC_FIELDS,
  defaultConfig,
  type OrganizationConfig,
  type DashboardWidget,
} from "@/lib/studio/config";

/**
 * Dynamic Enterprise Studio — org-scoped configuration engine.
 * Gated behind FLUX-ENT Enterprise license (cryptographic Ed25519 verification).
 *
 * Tables: organization_configs (organization_id PK, dashboard_layout_json, dynamic_schema_json, copilot_rules_json)
 * RLS: is_organization_member for SELECT, is_organization_admin for INSERT/UPDATE/DELETE
 * All actions typed with SupabaseClient<Database> and Zod guards.
 */

type TypedClient = SupabaseClient<Database>;

// ── Zod schemas for validation (RCE-safe: no code execution, only JSON structure) ─

const widgetSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/, "Widget ID must be lowercase alphanumeric + underscore."),
  label: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(100),
  category: z.string().trim().max(50).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const dynamicFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_]+$/, "Field key must be lowercase alphanumeric + underscore."),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "number", "select", "boolean", "date"]),
  required: z.boolean(),
  description: z.string().trim().max(300).optional(),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

const copilotRuleSchema = z.object({
  id: z.string().trim().max(80).optional(),
  trigger: z.string().trim().min(1).max(200),
  action: z.string().trim().min(1).max(100),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const organizationConfigUpdateSchema = z.object({
  dashboardLayout: z
    .object({
      widgets: z.array(widgetSchema).min(1).max(50),
    })
    .optional(),
  dynamicSchema: z
    .object({
      fields: z.array(dynamicFieldSchema).max(100),
    })
    .optional(),
  copilotRules: z
    .object({
      rules: z.array(copilotRuleSchema).max(100),
    })
    .optional(),
});

function safeParseJson(value: Json | null, fallback: Json): Json {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value)) as Json;
  } catch {
    return fallback;
  }
}

function mapRowToConfig(
  organizationId: string,
  row: Database["public"]["Tables"]["organization_configs"]["Row"] | null,
): OrganizationConfig {
  if (!row) {
    return defaultConfig(organizationId);
  }

  const layoutJson = safeParseJson(row.dashboard_layout_json as Json, {} as Json) as {
    widgets?: OrganizationConfig["dashboardLayout"]["widgets"];
  };
  const schemaJson = safeParseJson(row.dynamic_schema_json as Json, {} as Json) as {
    fields?: OrganizationConfig["dynamicSchema"]["fields"];
  };
  const rulesJson = safeParseJson(row.copilot_rules_json as Json, {} as Json) as {
    rules?: OrganizationConfig["copilotRules"]["rules"];
  };

  // Merge with defaults to ensure all required widgets exist (forward compatibility)
  const existingWidgets = layoutJson.widgets ?? [];
  const widgetMap = new Map(existingWidgets.map((w) => [w.id, w]));
  const mergedWidgets: DashboardWidget[] = DEFAULT_WIDGETS.map((def) => {
    const existing = widgetMap.get(def.id);
    if (existing) {
      return {
        id: def.id,
        label: existing.label ?? def.label,
        enabled: existing.enabled ?? def.enabled,
        order: existing.order ?? def.order,
        category: existing.category ?? def.category,
        config: existing.config,
      };
    }
    return { ...def };
  });
  // Include any custom widgets not in defaults
  for (const w of existingWidgets) {
    if (!mergedWidgets.find((mw) => mw.id === w.id)) {
      mergedWidgets.push({
        id: w.id,
        label: w.label,
        enabled: w.enabled,
        order: w.order,
        category: w.category ?? "custom",
        config: w.config,
      });
    }
  }
  mergedWidgets.sort((a, b) => a.order - b.order);

  return {
    organizationId,
    dashboardLayout: {
      widgets: mergedWidgets,
    },
    dynamicSchema: {
      fields: schemaJson.fields ?? DEFAULT_DYNAMIC_FIELDS.map((f) => ({ ...f, options: f.options ? [...f.options] : [] })),
    },
    copilotRules: {
      rules: rulesJson.rules ?? [],
    },
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
    isDefault: false,
  };
}

/**
 * Reads org configuration with safe fallback to system defaults.
 * Any org member can read (SELECT RLS = is_organization_member).
 */
export async function getOrganizationConfigAction(): Promise<ActionResponse<OrganizationConfig>> {
  const auth = await requireOrganizationContext("employee");
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    const { data, error } = await supabase
      .from("organization_configs")
      .select("*")
      .eq("organization_id", auth.data.organizationId)
      .maybeSingle();

    if (error) {
      return actionFailure(error.message);
    }

    const config = mapRowToConfig(
      auth.data.organizationId,
      data as Database["public"]["Tables"]["organization_configs"]["Row"] | null,
    );

    return actionSuccess(config);
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to load organization config.",
    );
  }
}

/**
 * Admin-only action to validate and persist JSON layout/schema changes.
 * Rejects with 403 ENTITLEMENT_REQUIRED if license tier is not ENTERPRISE.
 * RCE-safe: only validates JSON structure via Zod, no code execution.
 */
export async function updateOrganizationConfigAction(
  input: z.input<typeof organizationConfigUpdateSchema>,
): Promise<ActionResponse<OrganizationConfig>> {
  const parsed = organizationConfigUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  // Enterprise license guard — cryptographic verification of FLUX-ENT key
  try {
    await requireEnterpriseTier();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Enterprise license required.";
    // Explicit 403 ENTITLEMENT_REQUIRED per spec
    return actionFailure(`403 ENTITLEMENT_REQUIRED: ${msg}`);
  }

  const auth = await requireOrganizationContext("admin");
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    // Fetch existing to merge (partial updates allowed)
    const { data: existing } = await supabase
      .from("organization_configs")
      .select("*")
      .eq("organization_id", auth.data.organizationId)
      .maybeSingle();

    const currentConfig = mapRowToConfig(
      auth.data.organizationId,
      existing as Database["public"]["Tables"]["organization_configs"]["Row"] | null,
    );

    const nextLayout = parsed.data.dashboardLayout ?? currentConfig.dashboardLayout;
    const nextSchema = parsed.data.dynamicSchema ?? currentConfig.dynamicSchema;
    const nextRules = parsed.data.copilotRules ?? currentConfig.copilotRules;

    // Additional safety: ensure widget order is unique and sequential
    if (nextLayout.widgets) {
      const sorted = [...nextLayout.widgets].sort((a, b) => a.order - b.order);
      sorted.forEach((w, idx) => {
        w.order = idx;
      });
      nextLayout.widgets = sorted;
    }

    // Validate no duplicate keys in dynamic schema
    if (nextSchema.fields) {
      const keys = new Set<string>();
      for (const field of nextSchema.fields) {
        if (keys.has(field.key)) {
          return actionFailure(`Duplicate field key: ${field.key}`);
        }
        keys.add(field.key);
      }
    }

    const { data, error } = await supabase
      .from("organization_configs")
      .upsert(
        {
          organization_id: auth.data.organizationId,
          dashboard_layout_json: nextLayout as unknown as Json,
          dynamic_schema_json: nextSchema as unknown as Json,
          copilot_rules_json: nextRules as unknown as Json,
          updated_by: auth.data.userId,
          updated_at: new Date().toISOString(),
        } as Database["public"]["Tables"]["organization_configs"]["Insert"],
        { onConflict: "organization_id" },
      )
      .select("*")
      .single();

    if (error) {
      return actionFailure(error.message);
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_id: auth.data.userId,
      action: "update",
      entity_type: "organization_configs",
      entity_id: auth.data.organizationId,
      metadata: {
        action: "studio.config.update",
        widgets: nextLayout.widgets?.length ?? 0,
        fields: nextSchema.fields?.length ?? 0,
      } as unknown as Json,
    } as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    const config = mapRowToConfig(
      auth.data.organizationId,
      data as Database["public"]["Tables"]["organization_configs"]["Row"],
    );

    return actionSuccess(config);
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to update organization config.",
    );
  }
}

/**
 * Resets layout and schema settings to platform defaults.
 * Admin-only + Enterprise-only.
 */
export async function resetOrganizationConfigAction(): Promise<ActionResponse<OrganizationConfig>> {
  try {
    await requireEnterpriseTier();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Enterprise license required.";
    return actionFailure(`403 ENTITLEMENT_REQUIRED: ${msg}`);
  }

  const auth = await requireOrganizationContext("admin");
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    const { error } = await supabase
      .from("organization_configs")
      .delete()
      .eq("organization_id", auth.data.organizationId);

    if (error) {
      return actionFailure(error.message);
    }

    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_id: auth.data.userId,
      action: "update",
      entity_type: "organization_configs",
      entity_id: auth.data.organizationId,
      metadata: {
        action: "studio.config.reset",
      } as unknown as Json,
    } as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return actionSuccess(defaultConfig(auth.data.organizationId));
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to reset organization config.",
    );
  }
}

/**
 * Returns current license tier info for UI gating (does not throw).
 */
export async function getStudioEntitlementAction(): Promise<
  ActionResponse<{ tier: string | null; isEnterprise: boolean; isPro: boolean }>
> {
  const auth = await requireOrganizationContext("employee");
  if (!auth.success) {
    return auth;
  }

  try {
    const license = await getLicenseState();
    return actionSuccess({
      tier: license?.tier ?? null,
      isEnterprise: license?.tier === "ENTERPRISE",
      isPro: license?.tier === "PRO" || license?.tier === "ENTERPRISE",
    });
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to check entitlement.",
    );
  }
}
