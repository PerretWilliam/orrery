import { log } from "@/lib/logger";
import type { ResolvedToken } from "../domain/token";
import type { SetupStore } from "./store";

/**
 * At startup: apply migrations, seed the access policy from the environment, then, if the instance has not been set up, print how to do it.
 * The generated token is in the message on purpose (the log field filter would hide it): it is meant to be read
 * in the container logs. A token from ORRERY_SETUP_TOKEN is never printed.
 */
export async function bootInstance(deps: {
  databaseUrl: string | undefined;
  migrate: () => Promise<void>;
  /** Admins and sign-in allowlist from the environment. Runs on every start, after the migrations. */
  seedAccess: () => Promise<void>;
  store: () => SetupStore;
  token: ResolvedToken;
}): Promise<void> {
  if (!deps.databaseUrl) {
    log("warn", "DATABASE_URL is not set: migrations and setup are skipped");
    return;
  }
  await deps.migrate();
  await deps.seedAccess();
  if (await deps.store().isCompleted()) return;
  if (deps.token.warning) log("warn", deps.token.warning);
  log(
    "info",
    deps.token.source === "env"
      ? "Orrery is not set up yet. Open /setup and enter the value of ORRERY_SETUP_TOKEN."
      : `Orrery is not set up yet. Open /setup and enter this setup token: ${deps.token.token}`,
  );
}
