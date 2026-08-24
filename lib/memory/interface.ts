import type {
  MemoryProvider,
  MemoryTestResult,
  Row,
  RowFilter,
} from "./types";

/**
 * The generic storage contract every memory backend implements.
 *
 * Operations are table-based (collection name → rows) so the domain layer in
 * `lib/api.ts` / `lib/actions.ts` stays identical regardless of which backend
 * is active. Filtering is single-column equality, which covers the app's
 * org-scoping and per-record lookups.
 */
export interface MemoryAdapter {
  readonly provider: MemoryProvider;
  readonly label: string;

  /** Verifies connectivity/credentials without mutating data. */
  testConnection(): Promise<MemoryTestResult>;

  /** Lists rows in a table, optionally filtered by one column value. */
  select<T extends Row = Row>(
    table: string,
    filter?: RowFilter,
  ): Promise<T[]>;

  /** Inserts (or replaces) a row. */
  insert(table: string, row: Row): Promise<void>;

  /** Updates rows matching the filter. */
  update(table: string, filter: RowFilter, patch: Row): Promise<void>;

  /** Deletes rows matching the filter. */
  remove(table: string, filter: RowFilter): Promise<void>;
}
