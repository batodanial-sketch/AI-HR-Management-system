/**
 * Memory layer — types.
 *
 * "Memory" is Fluxentiq's pluggable persistence backend. Supabase is the
 * default, but a buyer can point the app at PostgreSQL, Xata (Postgres wire),
 * SQLite, a custom PostgREST-compatible endpoint, or a local on-device store.
 * The data layer reads/writes through one `MemoryAdapter`; switching the
 * backend never touches domain code.
 */

export type MemoryProvider =
  | "supabase"
  | "postgresql"
  | "xata"
  | "sqlite"
  | "custom"
  | "local";

export interface MemoryConnectionConfig {
  /** postgresql / xata — full connection string (takes precedence). */
  connectionString: string;
  /** postgresql — discrete fields (used when connectionString is empty). */
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** sqlite / local — file path (local defaults to data/local-memory.sqlite). */
  sqlitePath: string;
  /** custom — PostgREST-compatible base URL. */
  customBaseUrl: string;
  /** custom — API/service key for the custom endpoint. */
  customApiKey: string;
}

export interface MemorySettings {
  provider: MemoryProvider;
  connection: MemoryConnectionConfig;
}

export interface MemoryTestResult {
  ok: boolean;
  message: string;
}

export interface RowFilter {
  column: string;
  value: string;
}

export type Row = Record<string, unknown>;

export const MEMORY_PROVIDER_LABELS: Record<MemoryProvider, string> = {
  supabase: "Supabase (default)",
  postgresql: "PostgreSQL",
  xata: "Xata",
  sqlite: "SQLite",
  custom: "Custom endpoint",
  local: "Local (on this device)",
};

export function defaultMemorySettings(): MemorySettings {
  return {
    provider: "supabase",
    connection: {
      connectionString: "",
      host: "",
      port: 5432,
      database: "",
      user: "",
      password: "",
      sqlitePath: "",
      customBaseUrl: "",
      customApiKey: "",
    },
  };
}
