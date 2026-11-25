import { createAuthStore } from "@/features/auth/server/drizzle-store";
import { getDb } from "@/lib/db/instance";
import { globalSingleton } from "@/lib/singleton";
import { startCachePurge } from "@/features/data-proxy/server/purge-job";
import { createAuditStore } from "./drizzle-store";
import { createAudit } from "./service";

export const getAudit = () =>
  globalSingleton("audit", () => createAudit({ store: createAuditStore(getDb()), isAdmin: (login) => createAuthStore(getDb()).isAdmin(login), now: () => new Date() }));

/** Called once at startup: purges what is past the retention, then every day. */
export const startAuditPurgeJob = (): (() => void) =>
  startCachePurge({
    purge: () => getAudit().purge(),
    schedule: (task, ms) => {
      const timer = setTimeout(task, ms);
      timer.unref();
      return () => clearTimeout(timer);
    },
  });
