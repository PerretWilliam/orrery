import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client";

export class SchemaTooNewError extends Error {
  constructor(
    readonly databaseVersion: number,
    readonly appVersion: number,
  ) {
    super(`Database schema (${databaseVersion}) is newer than this app (${appVersion}); upgrade the app.`);
    this.name = "SchemaTooNewError";
  }
}

/** Version of a migration set = timestamp of its latest migration (Drizzle's `when`). */
export function latestVersion(journalJson: string): number {
  const { entries } = JSON.parse(journalJson) as { entries: { when: number }[] };
  return Math.max(0, ...entries.map((e) => e.when));
}

/** Refuses to start on a schema applied by a newer app version. */
export function assertSchemaNotNewer(databaseVersion: number, appVersion: number): void {
  if (databaseVersion > appVersion) throw new SchemaTooNewError(databaseVersion, appVersion);
}

export async function databaseVersion(db: Db): Promise<number> {
  const exists = await db.execute(sql`select to_regclass('drizzle.__drizzle_migrations') as t`);
  if (!exists.rows[0]?.t) return 0;
  const max = await db.execute(sql`select coalesce(max(created_at), 0) as v from drizzle.__drizzle_migrations`);
  return Number(max.rows[0]?.v);
}

/** Latest migration version shipped with this app. */
export function appVersion(folder = join(process.cwd(), "drizzle")): number {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- folder is the app's own migrations directory, never user input
  return latestVersion(readFileSync(join(folder, "meta", "_journal.json"), "utf8"));
}

/** Applies pending migrations at startup, unless the database is ahead of the app. */
export async function runMigrations(db: Db, folder = join(process.cwd(), "drizzle")): Promise<void> {
  assertSchemaNotNewer(await databaseVersion(db), appVersion(folder));
  await migrate(db, { migrationsFolder: folder });
}
