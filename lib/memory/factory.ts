import "server-only";
import { readSettings } from "@/lib/settings/config";
import { CustomRestAdapter } from "./adapters/custom";
import { PostgresAdapter } from "./adapters/postgres";
import { SqliteAdapter } from "./adapters/sqlite";
import { SupabaseAdapter } from "./adapters/supabase";
import type { MemoryAdapter } from "./interface";
import type { MemoryProvider } from "./types";

/**
 * Resolves the active memory adapter from the persisted settings.
 *
 * Supabase (the default) reads credentials from the environment; every other
 * backend reads its connection details from `data/settings.json` (configured
 * via the Settings UI).
 */
export async function getMemoryAdapter(): Promise<MemoryAdapter> {
  const settings = await readSettings();
  return buildAdapter(settings.memory.provider, settings.memory.connection);
}

/** Builds an adapter for an explicit provider + connection (used by the test route). */
export function buildAdapter(
  provider: MemoryProvider,
  connection: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    sqlitePath?: string;
    customBaseUrl?: string;
    customApiKey?: string;
  },
): MemoryAdapter {
  switch (provider) {
    case "postgresql":
      return new PostgresAdapter("postgresql", connection);
    case "xata":
      return new PostgresAdapter("xata", connection);
    case "sqlite":
      return new SqliteAdapter("sqlite", connection.sqlitePath);
    case "local":
      return new SqliteAdapter("local", connection.sqlitePath);
    case "custom":
      return new CustomRestAdapter({
        baseUrl: connection.customBaseUrl,
        apiKey: connection.customApiKey,
      });
    case "supabase":
    default:
      return new SupabaseAdapter();
  }
}
