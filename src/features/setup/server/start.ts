import { getDb } from "@/lib/db/instance";
import { runMigrations } from "@/lib/db/migrate";
import { bootInstance } from "./boot";
import { createSetupStore } from "./drizzle-store";
import { getSetupToken } from "./token-holder";

/** Called once by `instrumentation.ts` when the server starts. */
export const startInstance = (): Promise<void> =>
  bootInstance({
    databaseUrl: process.env.DATABASE_URL,
    migrate: () => runMigrations(getDb()),
    store: () => createSetupStore(getDb()),
    token: getSetupToken(),
  });
