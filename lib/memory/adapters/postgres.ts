import "server-only";
import { Pool, type PoolConfig } from "pg";
import type { MemoryAdapter } from "../interface";
import type { MemoryTestResult, Row, RowFilter } from "../types";

/**
 * PostgreSQL adapter — also serves Xata, which speaks the Postgres wire
 * protocol via its connection string.
 */
export class PostgresAdapter implements MemoryAdapter {
  readonly provider: "postgresql" | "xata";
  readonly label: string;
  private readonly pool: Pool;

  constructor(
    provider: "postgresql" | "xata",
    config: {
      connectionString?: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
    },
  ) {
    this.provider = provider;
    this.label = provider === "xata" ? "Xata" : "PostgreSQL";

    const poolConfig: PoolConfig = config.connectionString
      ? { connectionString: config.connectionString }
      : {
          host: config.host || "localhost",
          port: config.port || 5432,
          database: config.database,
          user: config.user,
          password: config.password,
        };
    this.pool = new Pool({ ...poolConfig, max: 5, connectionTimeoutMillis: 8000 });
  }

  private static quote(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  async testConnection(): Promise<MemoryTestResult> {
    try {
      await this.pool.query("SELECT 1");
      return { ok: true, message: `Connected to ${this.label}.` };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message || `Connection failed (${this.label}).`
          : "Connection failed.";
      return { ok: false, message };
    } finally {
      // Release the pool after a test so the process can exit cleanly.
      await this.pool.end().catch(() => undefined);
    }
  }

  async select<T extends Row = Row>(
    table: string,
    filter?: RowFilter,
  ): Promise<T[]> {
    const base = `SELECT * FROM ${PostgresAdapter.quote(table)}`;
    if (filter) {
      const result = await this.pool.query(
        `${base} WHERE ${PostgresAdapter.quote(filter.column)} = $1`,
        [filter.value],
      );
      return result.rows as T[];
    }
    const result = await this.pool.query(base);
    return result.rows as T[];
  }

  async insert(table: string, row: Row): Promise<void> {
    const columns = Object.keys(row);
    if (columns.length === 0) {
      return;
    }
    const quotedColumns = columns.map(PostgresAdapter.quote).join(", ");
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const values = columns.map((column) => row[column]);
    const sql = `INSERT INTO ${PostgresAdapter.quote(table)} (${quotedColumns}) VALUES (${placeholders})
      ON CONFLICT (id) DO UPDATE SET ${columns
        .filter((column) => column !== "id")
        .map(
          (column, index) =>
            `${PostgresAdapter.quote(column)} = EXCLUDED.${PostgresAdapter.quote(column)}`,
        )
        .join(", ")}`;
    await this.pool.query(sql, values);
  }

  async update(table: string, filter: RowFilter, patch: Row): Promise<void> {
    const columns = Object.keys(patch);
    if (columns.length === 0) {
      return;
    }
    const assignments = columns
      .map((column, index) => `${PostgresAdapter.quote(column)} = $${index + 1}`)
      .join(", ");
    const values = [...columns.map((column) => patch[column]), filter.value];
    const sql = `UPDATE ${PostgresAdapter.quote(table)} SET ${assignments}
      WHERE ${PostgresAdapter.quote(filter.column)} = $${columns.length + 1}`;
    await this.pool.query(sql, values);
  }

  async remove(table: string, filter: RowFilter): Promise<void> {
    await this.pool.query(
      `DELETE FROM ${PostgresAdapter.quote(table)} WHERE ${PostgresAdapter.quote(filter.column)} = $1`,
      [filter.value],
    );
  }
}
