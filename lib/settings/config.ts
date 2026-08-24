import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultMemorySettings, type MemorySettings } from "@/lib/memory/types";
import type { LicenseState } from "@/lib/license-format";

/**
 * Server-side settings store.
 *
 * Deployment-level configuration (AI provider keys, memory backend, branding,
 * license/trial state) is persisted to `data/settings.json` so a buyer can
 * configure everything from the Settings UI without editing environment files.
 *
 * NOTE: `data/` is gitignored and should be restricted (chmod 600) on real
 * deployments, since it may contain API keys.
 */

export interface AppearanceSettings {
  theme: "light" | "dark";
  accent: string;
}

export interface AiProviderSettings {
  provider: string; // openai | groq | gemini | anthropic | custom
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface BrandingSettings {
  appName: string;
  vendorName: string;
  accent: string; // hex color
  logoUrl: string;
  faviconUrl: string;
}

export interface AppSettings {
  appearance: AppearanceSettings;
  ai: AiProviderSettings;
  memory: MemorySettings;
  branding: BrandingSettings;
  license: LicenseState | null;
}

const SETTINGS_FILE = path.join(process.cwd(), "data", "settings.json");

/**
 * In-memory cache for the settings file. `readSettings()` is called 2–3× per
 * request (root layout, marketing layout, generateMetadata) and each call
 * reads + parses the JSON file synchronously from disk — a measurable cost on
 * every route. Cache the parsed object for a short TTL and invalidate on
 * write, so reads are near-free while settings changes still propagate within
 * a few seconds.
 */
let settingsCache: { value: AppSettings; expiresAt: number } | null = null;
const SETTINGS_CACHE_TTL_MS = 3_000;

export function defaultSettings(): AppSettings {
  return {
    appearance: { theme: "dark", accent: "indigo" },
    ai: { provider: "groq", apiKey: "", model: "", baseUrl: "" },
    memory: defaultMemorySettings(),
    branding: {
      appName: "Fluxentiq",
      vendorName: "Fluxentiq",
      accent: "",
      logoUrl: "",
      faviconUrl: "",
    },
    license: null,
  };
}

export async function readSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) {
    return settingsCache.value;
  }
  let settings: AppSettings;
  try {
    const raw = await readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    settings = mergeSettings(defaultSettings(), parsed);
  } catch {
    settings = defaultSettings();
  }
  settingsCache = { value: settings, expiresAt: now + SETTINGS_CACHE_TTL_MS };
  return settings;
}

export async function writeSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await readSettings();
  const next = mergeSettings(current, patch);
  await mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  // Invalidate the cache immediately so the write is visible on the next read.
  settingsCache = { value: next, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
  return next;
}

function mergeSettings(
  base: AppSettings,
  patch: Partial<AppSettings>,
): AppSettings {
  return {
    appearance: { ...base.appearance, ...patch.appearance },
    ai: { ...base.ai, ...patch.ai },
    memory: {
      ...base.memory,
      ...patch.memory,
      connection: {
        ...base.memory.connection,
        ...patch.memory?.connection,
      },
    },
    branding: { ...base.branding, ...patch.branding },
    license: patch.license !== undefined ? patch.license : base.license,
  };
}
