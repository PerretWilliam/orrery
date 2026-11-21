import { SETTINGS_CONTEXT } from "@/features/setup/server/service";
import { decrypt, keyringFromEnv } from "@/lib/crypto";
import { getDb } from "@/lib/db/instance";
import { log } from "@/lib/logger";
import { globalSingleton } from "@/lib/singleton";
import type { RepoRef } from "../domain/git-provider";
import { createDiscovery } from "./discovery";
import { createRepoStore } from "./drizzle-store";
import { createGitHubProvider } from "./github";
import { startPolling } from "./poller";

/** The one GitHub adapter of the process: the App's id and key come from the database, the key decrypted only when needed. */
export const getGitProvider = () =>
  globalSingleton("git-provider", () =>
    createGitHubProvider({
      fetch: (input, init) => fetch(input, init),
      credentials: async () => {
        const found = await createRepoStore(getDb()).credentials();
        return found && { appId: found.appId, privateKey: decrypt(found.privateKeyCiphertext, keyringFromEnv(), SETTINGS_CONTEXT.privateKey) };
      },
    }),
  );

export const getDiscovery = () => globalSingleton("discovery", () => createDiscovery({ git: getGitProvider(), store: createRepoStore(getDb()), now: () => new Date() }));

/** Starts a look in the background, for the webhook: its answer to GitHub never waits for it, and a failure is only logged. */
export function discover(target: RepoRef | "all"): void {
  void (async () => {
    try {
      await (target === "all" ? getDiscovery().syncAll() : getDiscovery().refresh(target));
    } catch (error) {
      log("warn", "repository discovery failed", { error: error instanceof Error ? error.message : "unknown error" });
    }
  })();
}

/** Called once at startup. Polls every few minutes, or looks once and waits for webhooks when `ORRERY_PUBLIC_URL` is set. */
export const startDiscovery = (): (() => void) =>
  startPolling({
    syncAll: () => getDiscovery().syncAll(),
    settings: () => createRepoStore(getDb()).settings(),
    webhooks: Boolean(process.env.ORRERY_PUBLIC_URL),
    schedule: (task, ms) => {
      const timer = setTimeout(task, ms);
      timer.unref();
      return () => clearTimeout(timer);
    },
  });
