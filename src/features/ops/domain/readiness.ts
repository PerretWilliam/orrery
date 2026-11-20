export type Readiness = { ready: true } | { ready: false; reason: "database_unreachable" | "migrations_pending" | "schema_too_new" };

/** Pure verdict from what the database reported. `databaseVersion` is null when unreachable. */
export function readiness(databaseVersion: number | null, appVersion: number): Readiness {
  if (databaseVersion === null) return { ready: false, reason: "database_unreachable" };
  if (databaseVersion > appVersion) return { ready: false, reason: "schema_too_new" };
  if (databaseVersion < appVersion) return { ready: false, reason: "migrations_pending" };
  return { ready: true };
}
