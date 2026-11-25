import { getDb } from "@/lib/db/instance";
import { purgeUnused } from "../domain/source-proxy";
import { createHttpCacheStore } from "./drizzle-store";
import { startCachePurge } from "./purge-job";

/** Called once at startup: forgets source cache entries nobody has read for 7 days, once a day. */
export const startCachePurgeJob = (): (() => void) =>
  startCachePurge({
    purge: () => purgeUnused(createHttpCacheStore(getDb())),
    schedule: (task, ms) => {
      const timer = setTimeout(task, ms);
      timer.unref();
      return () => clearTimeout(timer);
    },
  });
