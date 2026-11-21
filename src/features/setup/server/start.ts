import { createAccessStore } from "@/features/access/server/drizzle-store";
import { seedAccess } from "@/features/access/server/seed";
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
    seedAccess: () => seedAccess({ env: process.env, store: createAccessStore(getDb()) }),
    store: () => createSetupStore(getDb()),
    token: getSetupToken(),
  });
