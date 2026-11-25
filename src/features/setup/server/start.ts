import { startAuditPurgeJob } from "@/features/audit/server/runtime";
import { createAccessStore } from "@/features/access/server/drizzle-store";
import { seedAccess } from "@/features/access/server/seed";
import { startCachePurgeJob } from "@/features/data-proxy/server/runtime";
import { startDiscovery } from "@/features/repos/server/runtime";
import { getDb } from "@/lib/db/instance";
import { runMigrations } from "@/lib/db/migrate";
import { bootInstance } from "./boot";
import { createSetupStore } from "./drizzle-store";
import { getSetupToken } from "./token-holder";

/** Called once by `instrumentation.ts` when the server starts. */
export async function startInstance(): Promise<void> {
  await bootInstance({
    databaseUrl: process.env.DATABASE_URL,
    migrate: () => runMigrations(getDb()),
    seedAccess: () => seedAccess({ env: process.env, store: createAccessStore(getDb()) }),
    store: () => createSetupStore(getDb()),
    token: getSetupToken(),
  });
  if (process.env.DATABASE_URL) {
    startDiscovery();
    startCachePurgeJob();
    startAuditPurgeJob();
  }
}
