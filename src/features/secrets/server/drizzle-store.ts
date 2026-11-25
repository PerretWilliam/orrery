import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { repositories, secrets } from "@/lib/db/schema";
import type { SecretsReader, SecretsStore } from "./store";

/** Drizzle implementation of `SecretsStore`. Excluded from unit coverage; tests/integration/secrets-store.test.ts runs it on Postgres. */
export function createSecretsStore(db: Db): SecretsStore {
  return {
    async repositoryId(repo) {
      const [row] = await db
        .select({ id: repositories.id })
        .from(repositories)
        .where(sql`lower(${repositories.owner}) = lower(${repo.owner}) and lower(${repositories.name}) = lower(${repo.name})`);
      return row?.id ?? null;
    },
    // The ciphertext is never selected: a list cannot leak a value, encrypted or not.
    async list(repositoryId) {
      return db
        .select({ name: secrets.name, boundHosts: secrets.boundHosts, updatedAt: secrets.updatedAt })
        .from(secrets)
        .where(eq(secrets.repositoryId, repositoryId))
        .orderBy(secrets.name);
    },
    async save(entry, now) {
      const values = { ciphertext: entry.ciphertext, keyId: entry.keyId, boundHosts: entry.boundHosts, updatedAt: now };
      await db
        .insert(secrets)
        .values({ repositoryId: entry.repositoryId, name: entry.name, createdBy: entry.userId, createdAt: now, ...values })
        .onConflictDoUpdate({ target: [secrets.repositoryId, secrets.name], set: values });
    },
    async remove(repositoryId, name) {
      const gone = await db.delete(secrets).where(and(eq(secrets.repositoryId, repositoryId), eq(secrets.name, name))).returning({ id: secrets.id });
      return gone.length > 0;
    },
  };
}

/** Drizzle implementation of `SecretsReader`; excluded from unit coverage like `createSecretsStore`. */
export function createSecretsReader(db: Db): SecretsReader {
  return {
    async encrypted(repositoryId) {
      return db.select({ name: secrets.name, ciphertext: secrets.ciphertext, boundHosts: secrets.boundHosts }).from(secrets).where(eq(secrets.repositoryId, repositoryId));
    },
  };
}
