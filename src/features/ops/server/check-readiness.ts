import { appVersion, databaseVersion } from "@/lib/db/migrate";
import type { Db } from "@/lib/db/client";
import { log } from "@/lib/logger";
import { readiness, type Readiness } from "../domain/readiness";

/** Database reachable and migrations applied. Any failure means "not ready", never a throw. */
export async function checkReadiness(getDb: () => Db): Promise<Readiness> {
  try {
    return readiness(await databaseVersion(getDb()), appVersion());
  } catch (error) {
    log("error", "readiness check failed", { error: error instanceof Error ? error.message : String(error) });
    return readiness(null, 0);
  }
}
