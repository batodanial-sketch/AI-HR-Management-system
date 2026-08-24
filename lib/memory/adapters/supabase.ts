import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { MemoryAdapter } from "../interface";
import type { MemoryTestResult, Row, RowFilter } from "../types";
import { supabaseUrl, supabasePublishableKey, supabaseSecretKey } from "@/lib/supabase/env";

/**
 * Supabase adapter — the default memory backend.
 *
 * Wraps a cookie-aware Supabase server client with the generic table-based
 * contract. When Supabase is not configured, operations no-op gracefully
 * (empty reads, silent writes) so the app falls back to demo/seed data.
 */
export class SupabaseAdapter implements MemoryAdapter {
  readonly provider = "supabase" as const;
  readonly label = "Supabase";

  private get configured(): boolean {
    return Boolean(supabaseUrl() && (supabasePublishableKey() || supabaseSecretKey()));
  }

  private client() {
    return createServerClient(
      supabaseUrl(),
      supabasePublishableKey() || supabaseSecretKey(),
      {
        cookies: {
          getAll() {
            return cookies().getAll();
          },
          setAll() {
            // Read-only adapter path; token refresh is handled by middleware.
          },
        },
      },
    );
  }

  async testConnection(): Promise<MemoryTestResult> {
    if (!this.configured) {
      return {
        ok: false,
        message:
          "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      };
    }
    try {
      const { error } = await this.client().from("organizations").select("id").limit(1);
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true, message: "Connected to Supabase." };
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
    if (!this.configured) {
      return [];
    }
    let query = this.client().from(table).select("*");
    if (filter) {
      query = query.eq(filter.column, filter.value);
    }
    const { data, error } = await query;
    if (error || !data) {
      return [];
    }
    return data as unknown as T[];
  }

  async insert(table: string, row: Row): Promise<void> {
    if (!this.configured) {
      return;
    }
    const { error } = await this.client().from(table).insert(row);
    if (error) {
      throw new Error(`Supabase insert into "${table}" failed: ${error.message}`);
    }
  }

  async update(table: string, filter: RowFilter, patch: Row): Promise<void> {
    if (!this.configured) {
      return;
    }
    const { error } = await this.client()
      .from(table)
      .update(patch)
      .eq(filter.column, filter.value);
    if (error) {
      throw new Error(`Supabase update on "${table}" failed: ${error.message}`);
    }
  }

  async remove(table: string, filter: RowFilter): Promise<void> {
    if (!this.configured) {
      return;
    }
    const { error } = await this.client()
      .from(table)
      .delete()
      .eq(filter.column, filter.value);
    if (error) {
      throw new Error(`Supabase delete on "${table}" failed: ${error.message}`);
    }
  }
}
