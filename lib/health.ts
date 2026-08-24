import "server-only";
import packageJson from "../package.json";
import { bridgeUrl } from "@/lib/ai-proxy";
import { getMemoryAdapter } from "@/lib/memory/factory";
import { getLicenseState } from "@/lib/license";
import { readSettings } from "@/lib/settings/config";
import { getEmployees } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { TIER_LABELS } from "@/lib/license-format";

/**
 * Instance health aggregation — one endpoint that reports the state of every
 * subsystem (AI bridge, memory, license, app). Used by the System Health page
 * and available to monitoring tooling.
 */

export interface HealthComponent {
  status: "ok" | "degraded" | "down";
  label: string;
  detail: string;
}

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  components: HealthComponent[];
  summary: {
    aiProvider: string;
    memoryProvider: string;
    licenseTier: string;
    headcount: number;
    user: string;
  };
}

export function appVersion(): string {
  return typeof packageJson.version === "string" ? packageJson.version : "1.0.0";
}

async function checkAiBridge(): Promise<HealthComponent> {
  const settings = await readSettings();
  try {
    const response = await fetch(`${bridgeUrl()}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      return {
        status: "degraded",
        label: "AI bridge",
        detail: `Bridge responded ${response.status}.`,
      };
    }
    const body = (await response.json()) as { ai?: { provider?: string; model?: string } };
    const provider = body.ai?.provider ?? settings.ai.provider;
    const model = body.ai?.model ?? (settings.ai.model || "default");
    return {
      status: "ok",
      label: "AI bridge",
      detail: `${provider} / ${model}`,
    };
  } catch {
    return {
      status: "down",
      label: "AI bridge",
      detail: `Unreachable at ${bridgeUrl()}.`,
    };
  }
}

async function checkMemory(): Promise<HealthComponent> {
  const settings = await readSettings();
  try {
    const adapter = await getMemoryAdapter();
    const result = await adapter.testConnection();
    return {
      status: result.ok ? "ok" : "down",
      label: "Memory",
      detail: `${settings.memory.provider} — ${result.message}`,
    };
  } catch (err) {
    return {
      status: "down",
      label: "Memory",
      detail: err instanceof Error ? err.message : "Memory check failed.",
    };
  }
}

async function checkLicense(): Promise<HealthComponent> {
  const license = await getLicenseState();
  if (!license) {
    return { status: "down", label: "License", detail: "No active license." };
  }
  return {
    status: "ok",
    label: "License",
    detail: `${TIER_LABELS[license.tier]} (${license.organizationName || "unlicensed"})`,
  };
}

export async function getHealthReport(): Promise<HealthReport> {
  const [ai, memory, license] = await Promise.all([
    checkAiBridge(),
    checkMemory(),
    checkLicense(),
  ]);

  const components = [ai, memory, license];
  const hasDown = components.some((component) => component.status === "down");
  const hasDegraded = components.some((component) => component.status === "degraded");

  const settings = await readSettings();
  const user = await getCurrentUser();
  const employees = await getEmployees();

  return {
    status: hasDown ? "down" : hasDegraded ? "degraded" : "ok",
    version: appVersion(),
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    components,
    summary: {
      aiProvider: settings.ai.provider,
      memoryProvider: settings.memory.provider,
      licenseTier: (await getLicenseState())?.tier ?? "none",
      headcount: employees.length,
      user: user.email,
    },
  };
}
