import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { MemoryAdapter } from "../interface";
import type { MemoryTestResult, Row, RowFilter } from "../types";

/**
 * SQLite adapter — also serves "local" memory (an on-device SQLite file).
 *
 * Tables are created lazily from the shape of the first inserted row, so the
 * backend is fully generic without a pre-defined schema.
 */
export class SqliteAdapter implements MemoryAdapter {
  readonly provider: "sqlite" | "local";
  readonly label: string;
  private readonly db: Database.Database;

  constructor(
    provider: "sqlite" | "local",
    filePath?: string,
  ) {
    this.provider = provider;
    this.label = provider === "local" ? "Local (device)" : "SQLite";
    const resolved =
      filePath && filePath.trim().length > 0
        ? filePath
        : path.join(process.cwd(), "data", "local-memory.sqlite");
    mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new Database(resolved);
    this.db.pragma("journal_mode = WAL");
  }

  private static quote(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private tableExists(table: string): boolean {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(table);
    return Boolean(row);
  }

  private ensureTable(table: string, row: Row): void {
    if (this.tableExists(table)) {
      return;
    }
    const columns = Object.keys(row);
    if (columns.length === 0) {
      return;
    }
    const defs = columns
      .map((column) => {
        if (column === "id") {
          return `${SqliteAdapter.quote(column)} TEXT PRIMARY KEY`;
        }
        const value = row[column];
        const sqlType =
          typeof value === "number" ? "REAL" : "TEXT";
        return `${SqliteAdapter.quote(column)} ${sqlType}`;
      })
      .join(", ");
    this.db.exec(
      `CREATE TABLE ${SqliteAdapter.quote(table)} (${defs})`,
    );
  }

  async testConnection(): Promise<MemoryTestResult> {
    try {
      this.db.prepare("SELECT 1").get();
      return { ok: true, message: `${this.label} is ready.` };
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
    if (!this.tableExists(table)) {
      return [];
    }
    if (filter) {
      const rows = this.db
        .prepare(
          `SELECT * FROM ${SqliteAdapter.quote(table)} WHERE ${SqliteAdapter.quote(filter.column)} = ?`,
        )
        .all(filter.value);
      return rows as T[];
    }
    const rows = this.db
      .prepare(`SELECT * FROM ${SqliteAdapter.quote(table)}`)
      .all();
    return rows as T[];
  }

  async insert(table: string, row: Row): Promise<void> {
    this.ensureTable(table, row);
    const columns = Object.keys(row);
    if (columns.length === 0) {
      return;
    }
    const quotedColumns = columns.map(SqliteAdapter.quote).join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ${SqliteAdapter.quote(table)} (${quotedColumns}) VALUES (${placeholders})`,
      )
      .run(...columns.map((column) => row[column]));
  }

  async update(table: string, filter: RowFilter, patch: Row): Promise<void> {
    if (!this.tableExists(table)) {
      return;
    }
    const columns = Object.keys(patch);
    if (columns.length === 0) {
      return;
    }
    const assignments = columns
      .map((column) => `${SqliteAdapter.quote(column)} = ?`)
      .join(", ");
    this.db
      .prepare(
        `UPDATE ${SqliteAdapter.quote(table)} SET ${assignments} WHERE ${SqliteAdapter.quote(filter.column)} = ?`,
      )
      .run(...columns.map((column) => patch[column]), filter.value);
  }

  async remove(table: string, filter: RowFilter): Promise<void> {
    if (!this.tableExists(table)) {
      return;
    }
    this.db
      .prepare(
        `DELETE FROM ${SqliteAdapter.quote(table)} WHERE ${SqliteAdapter.quote(filter.column)} = ?`,
      )
      .run(filter.value);
  }
}
