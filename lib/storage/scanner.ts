import "server-only";

import { metrics } from "@/lib/observability/metrics";

/**
 * Malware scanner adapter — fail closed.
 *
 * Backends (env-selected):
 *   MALWARE_SCANNER=clamav-rest   → POST multipart to MALWARE_SCANNER_URL
 *                                   (clamav-rest / clamav-api style JSON)
 *   MALWARE_SCANNER=webhook       → POST raw bytes to MALWARE_SCANNER_URL,
 *                                   expects {"verdict":"clean"|"infected",...}
 *   MALWARE_SCANNER=disabled      → every scan returns UNAVAILABLE
 *                                   (uploads are refused; nothing is accepted)
 *
 * Contract (tested): only an explicit CLEAN verdict accepts a file. INFECTED
 * rejects. UNAVAILABLE / TIMEOUT / malformed responses NEVER accept — the
 * caller keeps the object quarantined and returns a retryable failure.
 */

export type ScanVerdict = "clean" | "infected" | "unavailable" | "timeout" | "error";

export interface ScanResult {
  verdict: ScanVerdict;
  engine: string;
  signature?: string | null;
  detail?: string;
  durationMs: number;
}

export interface ScannerConfig {
  backend: "clamav-rest" | "webhook" | "disabled";
  url: string | null;
  timeoutMs: number;
  token: string | null;
}

export function scannerConfig(env: NodeJS.ProcessEnv = process.env): ScannerConfig {
  const raw = (env.MALWARE_SCANNER ?? "disabled").toLowerCase();
  const backend = raw === "clamav-rest" || raw === "webhook" ? raw : "disabled";
  return {
    backend,
    url: env.MALWARE_SCANNER_URL ?? null,
    timeoutMs: Math.max(1000, Number(env.MALWARE_SCANNER_TIMEOUT_MS ?? 20_000) || 20_000),
    token: env.MALWARE_SCANNER_TOKEN ?? null,
  };
}

export function scannerEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  const c = scannerConfig(env);
  return c.backend !== "disabled" && Boolean(c.url);
}

type Fetcher = typeof fetch;

export async function scanBytes(
  bytes: Uint8Array,
  filename: string,
  options: { config?: ScannerConfig; fetcher?: Fetcher } = {},
): Promise<ScanResult> {
  const config = options.config ?? scannerConfig();
  const fetcher = options.fetcher ?? fetch;
  const t0 = Date.now();
  const done = (result: Omit<ScanResult, "durationMs">): ScanResult => {
    metrics.increment("malware_scans_total", { verdict: result.verdict });
    return { ...result, durationMs: Date.now() - t0 };
  };

  if (config.backend === "disabled" || !config.url) {
    return done({ verdict: "unavailable", engine: "none", detail: "Malware scanner is not configured." });
  }

  const headers: Record<string, string> = {};
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  // Copy into a plain ArrayBuffer-backed view (BodyInit/BlobPart typing).
  const body = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  body.set(bytes);
  let response: Response;
  try {
    if (config.backend === "clamav-rest") {
      const form = new FormData();
      form.append("file", new Blob([body]), filename.slice(0, 120));
      response = await fetcher(config.url, { method: "POST", headers, body: form, signal: AbortSignal.timeout(config.timeoutMs) });
    } else {
      response = await fetcher(config.url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(filename.slice(0, 120)) },
        body,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return done({ verdict: timeout ? "timeout" : "unavailable", engine: config.backend, detail: timeout ? "Scanner timed out." : "Scanner unreachable." });
  }

  if (!response.ok) {
    return done({ verdict: "unavailable", engine: config.backend, detail: `Scanner returned HTTP ${response.status}.` });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return done({ verdict: "error", engine: config.backend, detail: "Scanner response was not JSON." });
  }
  return done(interpretScannerPayload(payload, config.backend));
}

/**
 * Normalises scanner payloads. Anything that is not an explicit clean or
 * infected verdict is `error` (→ not accepted).
 */
export function interpretScannerPayload(payload: unknown, engine: string): Omit<ScanResult, "durationMs"> {
  if (!payload || typeof payload !== "object") return { verdict: "error", engine, detail: "Empty scanner payload." };
  const p = payload as Record<string, unknown>;

  // Generic webhook shape.
  if (typeof p.verdict === "string") {
    const v = p.verdict.toLowerCase();
    if (v === "clean") return { verdict: "clean", engine };
    if (v === "infected") return { verdict: "infected", engine, signature: typeof p.signature === "string" ? p.signature : null };
    return { verdict: "error", engine, detail: `Unknown verdict '${v}'.` };
  }

  // clamav-rest (ajilaag/clamav-rest): [{"Status":"OK"|"FOUND","Description":"..."}]
  const list = Array.isArray(p) ? p : Array.isArray(p.results) ? p.results : null;
  const first = (list?.[0] ?? p) as Record<string, unknown>;
  const status = String(first.Status ?? first.status ?? "").toUpperCase();
  if (status === "OK" || status === "CLEAN") return { verdict: "clean", engine };
  if (status === "FOUND" || status === "INFECTED") {
    return { verdict: "infected", engine, signature: typeof first.Description === "string" ? first.Description : typeof first.signature === "string" ? first.signature : null };
  }
  // clamav-api style: {"is_infected": bool, "viruses": [...]}
  if (typeof first.is_infected === "boolean") {
    return first.is_infected ? { verdict: "infected", engine, signature: Array.isArray(first.viruses) ? String(first.viruses[0] ?? "") : null } : { verdict: "clean", engine };
  }
  return { verdict: "error", engine, detail: "Unrecognised scanner payload." };
}
