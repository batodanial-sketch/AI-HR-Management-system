import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bridgeUrl, bridgeSecret } from "@/lib/ai-proxy";
import { checkRateLimit, limitForTier, orgScopedKey } from "@/lib/rate-limit";
import { getLicenseState, requireEnterpriseTier } from "@/lib/license";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationConfigAction, updateOrganizationConfigAction } from "@/app/actions/studioActions";
import type { OrganizationConfig } from "@/lib/studio/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AdminCopilotSchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
});

/**
 * Admin Infrastructure Copilot — RCE-safe.
 *
 * Accepts natural language admin commands (e.g., "Hide the turnover card and add a clearance field"),
 * proxies to FastAPI bridge `/api/engine/admin-copilot/parse` which converts to safe JSON patches
 * (deterministic regex + LLM fallback), then applies via `updateOrganizationConfigAction`.
 *
 * Security:
 * - Requires verified FLUX-ENT Enterprise license (Ed25519 offline verification) — 403 ENTITLEMENT_REQUIRED otherwise
 * - Admin-only (enforced by updateOrganizationConfigAction → requireOrganizationContext("admin"))
 * - Zero raw shell or un-sandboxed code execution — only validated JSON patches via Zod
 * - Org-scoped RLS via organization_configs table
 * - Rate-limited (tier-aware: Enterprise 600 req/min)
 */

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Enterprise guard — cryptographic verification of FLUX-ENT key
  try {
    await requireEnterpriseTier();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Enterprise license required.";
    return NextResponse.json(
      { ok: false, message: msg, code: "ENTITLEMENT_REQUIRED" },
      { status: 403 },
    );
  }

  // Rate limiting — org-scoped, tier-aware
  let organizationId: string | null = null;
  let tier: string | null = null;
  try {
    const user = await getCurrentUser();
    organizationId = user.organizationId ?? null;
  } catch {
    organizationId = null;
  }
  try {
    const license = await getLicenseState();
    tier = license?.tier ?? null;
  } catch {
    tier = null;
  }

  const tierLimit = limitForTier(tier as never);
  const rateKey = orgScopedKey(request, organizationId);
  const rate = checkRateLimit(rateKey, tierLimit);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, message: "Rate limit exceeded. Try again shortly.", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Reset": String(rate.resetAt),
          "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = AdminCopilotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid prompt." },
      { status: 400 },
    );
  }

  const { prompt } = parsed.data;

  // Get current org config for context-aware patching
  let currentConfig: OrganizationConfig | null = null;
  try {
    const cfgRes = await getOrganizationConfigAction();
    if (cfgRes.success) {
      currentConfig = cfgRes.data;
    }
  } catch {
    currentConfig = null;
  }

  // Proxy to Python bridge /api/engine/admin-copilot/parse
  const upstream = `${bridgeUrl()}/api/engine/admin-copilot/parse`;
  const secret = bridgeSecret();

  let bridgeResponse: Response;
  try {
    bridgeResponse = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Bridge-Secret": secret } : {}),
        ...(organizationId ? { "X-Organization-Id": organizationId } : {}),
      },
      body: JSON.stringify({
        prompt,
        current_config: currentConfig
          ? {
              dashboardLayout: currentConfig.dashboardLayout,
              dynamicSchema: currentConfig.dynamicSchema,
              copilotRules: currentConfig.copilotRules,
            }
          : null,
      }),
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: `AI bridge unreachable at ${upstream}` },
      { status: 502 },
    );
  }

  if (!bridgeResponse.ok) {
    const text = await bridgeResponse.text().catch(() => "Bridge error");
    return NextResponse.json(
      { ok: false, message: `Bridge error: ${text}` },
      { status: bridgeResponse.status },
    );
  }

  let bridgeJson: {
    ok: boolean;
    patch?: {
      dashboardLayout?: { widgets?: Array<{ id: string; enabled?: boolean; order?: number; label?: string }> } | null;
      dynamicSchema?: {
        fields?: Array<{ key: string; label: string; type: string; required: boolean; description?: string; options?: string[] }>;
        removeKeys?: string[];
        mode?: string;
      } | null;
    };
    message?: string;
    parsed?: boolean;
    source?: string;
  };

  try {
    bridgeJson = (await bridgeResponse.json()) as typeof bridgeJson;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid bridge response." }, { status: 502 });
  }

  if (!bridgeJson.ok || !bridgeJson.parsed || !bridgeJson.patch) {
    return NextResponse.json(
      {
        ok: false,
        message: bridgeJson.message ?? "Could not parse admin command. Try e.g., 'Hide the turnover card and add a clearance field'.",
        parsed: false,
      },
      { status: 422 },
    );
  }

  // Apply patch via updateOrganizationConfigAction (which re-validates via Zod + enterprise guard + admin guard)
  try {
    // Merge logic: if bridge returns partial widgets, merge with current config
    let nextDashboardLayout: OrganizationConfig["dashboardLayout"] | undefined;
    let nextDynamicSchema: OrganizationConfig["dynamicSchema"] | undefined;

    if (bridgeJson.patch.dashboardLayout?.widgets) {
      const currentWidgets = currentConfig?.dashboardLayout.widgets ?? [];
      const widgetMap = new Map(currentWidgets.map((w) => [w.id, w]));

      // Apply toggles
      for (const patchWidget of bridgeJson.patch.dashboardLayout.widgets) {
        const existing = widgetMap.get(patchWidget.id);
        if (existing) {
          widgetMap.set(patchWidget.id, {
            ...existing,
            enabled: patchWidget.enabled ?? existing.enabled,
            order: patchWidget.order ?? existing.order,
            label: patchWidget.label ?? existing.label,
          });
        } else if (patchWidget.id) {
          // Unknown widget — add as custom if valid ID
          widgetMap.set(patchWidget.id, {
            id: patchWidget.id,
            label: patchWidget.label ?? patchWidget.id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            enabled: patchWidget.enabled ?? true,
            order: patchWidget.order ?? currentWidgets.length,
          });
        }
      }

      const merged = Array.from(widgetMap.values()).sort((a, b) => a.order - b.order);
      // Re-sequentialize order
      merged.forEach((w, idx) => {
        w.order = idx;
      });

      nextDashboardLayout = { widgets: merged };
    }

    if (bridgeJson.patch.dynamicSchema) {
      const currentFields = currentConfig?.dynamicSchema.fields ?? [];
      let nextFields = [...currentFields];

      // Handle removals
      if (bridgeJson.patch.dynamicSchema.removeKeys?.length) {
        const removeSet = new Set(bridgeJson.patch.dynamicSchema.removeKeys);
        nextFields = nextFields.filter((f) => !removeSet.has(f.key));
      }

      // Handle additions (mode=add means merge, not replace)
      if (bridgeJson.patch.dynamicSchema.fields?.length) {
        const mode = bridgeJson.patch.dynamicSchema.mode ?? "add";
        if (mode === "add") {
          const existingKeys = new Set(nextFields.map((f) => f.key));
          for (const newField of bridgeJson.patch.dynamicSchema.fields) {
            if (!existingKeys.has(newField.key)) {
              nextFields.push({
                key: newField.key,
                label: newField.label,
                type: newField.type as never,
                required: newField.required ?? false,
                description: newField.description,
                options: newField.options,
              });
            }
          }
        } else {
          // Replace mode (full schema)
          nextFields = bridgeJson.patch.dynamicSchema.fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type as never,
            required: f.required ?? false,
            description: f.description,
            options: f.options,
          }));
        }
      }

      nextDynamicSchema = { fields: nextFields };
    }

    if (!nextDashboardLayout && !nextDynamicSchema) {
      return NextResponse.json(
        { ok: false, message: "No valid patch generated from prompt.", parsed: false },
        { status: 422 },
      );
    }

    const updateRes = await updateOrganizationConfigAction({
      dashboardLayout: nextDashboardLayout,
      dynamicSchema: nextDynamicSchema,
    });

    if (!updateRes.success) {
      return NextResponse.json(
        { ok: false, message: updateRes.error, code: updateRes.error.includes("ENTITLEMENT_REQUIRED") ? "ENTITLEMENT_REQUIRED" : "UPDATE_FAILED" },
        { status: updateRes.error.includes("ENTITLEMENT_REQUIRED") ? 403 : 400 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: bridgeJson.message ?? "Configuration updated via Admin Copilot.",
        patch: bridgeJson.patch,
        source: bridgeJson.source,
        config: updateRes.data,
        applied: true,
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(rate.remaining),
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Reset": String(rate.resetAt),
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Failed to apply patch." },
      { status: 500 },
    );
  }
}
