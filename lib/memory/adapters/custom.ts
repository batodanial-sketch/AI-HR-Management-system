import "server-only";
import type { MemoryAdapter } from "../interface";
import type { MemoryTestResult, Row, RowFilter } from "../types";

/**
 * Custom adapter — any PostgREST-compatible endpoint (the same REST protocol
 * Supabase exposes). Lets a buyer point Fluxentiq at their own API gateway or
 * a self-hosted PostgREST instance.
 */
export class CustomRestAdapter implements MemoryAdapter {
  readonly provider = "custom" as const;
  readonly label = "Custom endpoint";
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = (config.baseUrl ?? "").trim().replace(/\/+$/, "");
    this.apiKey = config.apiKey ?? "";
  }

  private restUrl(table: string, filter?: RowFilter): string {
    const params = new URLSearchParams({ select: "*" });
    if (filter) {
      params.append(filter.column, `eq.${filter.value}`);
    }
    return `${this.baseUrl}/${encodeURIComponent(table)}?${params.toString()}`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    if (this.apiKey) {
      headers.apikey = this.apiKey;
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error("Custom endpoint base URL is not configured.");
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(
        `Custom endpoint returned ${response.status}: ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  }

  async testConnection(): Promise<MemoryTestResult> {
    if (!this.baseUrl) {
      return { ok: false, message: "Custom endpoint base URL is not configured." };
    }
    try {
      await this.request("/", { method: "GET" });
      return { ok: true, message: "Custom endpoint reachable." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Connection failed.",
      };
    }
  }

  async select<T extends Row = Row>(
    table: string,
    filter?: RowFilter,
  ): Promise<T[]> {
    const path = this.restUrl(table, filter);
    const data = await this.request<unknown>(path, { method: "GET" });
    return (Array.isArray(data) ? data : []) as T[];
  }

  async insert(table: string, row: Row): Promise<void> {
    await this.request(`/${encodeURIComponent(table)}`, {
      method: "POST",
      body: JSON.stringify(row),
    });
  }

  async update(table: string, filter: RowFilter, patch: Row): Promise<void> {
    const params = new URLSearchParams({
      [filter.column]: `eq.${filter.value}`,
    });
    await this.request(
      `/${encodeURIComponent(table)}?${params.toString()}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
  }

  async remove(table: string, filter: RowFilter): Promise<void> {
    const params = new URLSearchParams({
      [filter.column]: `eq.${filter.value}`,
    });
    await this.request(
      `/${encodeURIComponent(table)}?${params.toString()}`,
      { method: "DELETE" },
    );
  }
}
