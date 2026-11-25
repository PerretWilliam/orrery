import { createSecretsReader } from "@/features/secrets/server/drizzle-store";
import { createSecretLookup } from "@/features/secrets/server/lookup";
import { keyringFromEnv } from "@/lib/crypto";
import { getDb } from "@/lib/db/instance";
import { globalSingleton } from "@/lib/singleton";
import { systemResolve } from "@/lib/ssrf-guard";
import { fetchSource } from "../domain/fetch-source";
import { createSourceProxy, purgeUnused } from "../domain/source-proxy";
import { createHttpCacheStore, createSsrfPolicyLoader } from "./drizzle-store";
import { startCachePurge } from "./purge-job";
import { createNodeSend } from "./transport";

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

/** The one data proxy of the process: real DNS and transport, the cache table, the admin's and project's hosts, the project's secrets. */
export const getSourceProxy = () =>
  globalSingleton("source-proxy", () => {
    const db = getDb();
    const send = createNodeSend();
    return createSourceProxy({
      store: createHttpCacheStore(db),
      fetch: (url, init, policy) => fetchSource(url, init, policy, { resolve: systemResolve, send }),
      loadPolicy: createSsrfPolicyLoader(db),
      loadSecrets: createSecretLookup({ reader: createSecretsReader(db), keyring: () => keyringFromEnv() }),
    });
  });
