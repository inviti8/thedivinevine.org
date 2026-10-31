// A minimal in-memory D1 for unit tests, backed by Node's built-in SQLite and
// loaded with the real migrations. Covers only the D1 API this codebase uses.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

export function createTestDb(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT)');
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
    sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(file);
  }

  const statement = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values as SQLInputValue[]),
    async first<T>(column?: string): Promise<T | null> {
      const row = sqlite.prepare(sql).get(...params) as Record<string, unknown> | undefined;
      if (!row) return null;
      return (column ? row[column] : row) as T;
    },
    async all<T>() {
      return { success: true, results: sqlite.prepare(sql).all(...params) as T[], meta: {} };
    },
    async run() {
      const res = sqlite.prepare(sql).run(...params);
      return { success: true, results: [], meta: { changes: Number(res.changes) } };
    },
  });

  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}
