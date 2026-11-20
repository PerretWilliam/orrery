import { createDb } from "./client";

let current: ReturnType<typeof createDb> | undefined;

/** Process-wide database handle, created on first use from DATABASE_URL. */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  current ??= createDb(url);
  return current.db;
}
