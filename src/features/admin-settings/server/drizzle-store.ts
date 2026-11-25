import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import type { ProjectRule } from "@/features/access/domain/policy";
import type { Db } from "@/lib/db/client";
import { instanceAdmins, instanceAllowedHosts, instanceSettings, projectRules, repositories, secrets, signInAllowlist } from "@/lib/db/schema";
import type { AdminStore, AppCiphertexts } from "./store";

const sameRepo = (repo: { owner: string; name: string }) => sql`lower(${repositories.owner}) = lower(${repo.owner}) and lower(${repositories.name}) = lower(${repo.name})`;
const subjectIs = (rule: ProjectRule) => (rule.effect === "hide" ? isNull(projectRules.subjectKind) : and(eq(projectRules.subjectKind, rule.subject.kind), eq(projectRules.subjectValue, rule.subject.value)));

/** Drizzle implementation of `AdminStore`. Excluded from unit coverage; tests/integration/admin-store.test.ts runs it on Postgres. */
export function createAdminStore(db: Db): AdminStore {
  return {
    async isAdmin(login) {
      const [row] = await db.select({ n: count() }).from(instanceAdmins).where(eq(instanceAdmins.login, login));
      return (row?.n ?? 0) > 0;
    },
    allowlist: () => db.select({ kind: signInAllowlist.kind, value: signInAllowlist.value }).from(signInAllowlist).orderBy(signInAllowlist.kind, signInAllowlist.value),
    async addAllow(entry, userId) {
      return (await db.insert(signInAllowlist).values({ ...entry, createdBy: userId }).onConflictDoNothing().returning({ id: signInAllowlist.id })).length > 0;
    },
    async removeAllow(entry) {
      return (await db.delete(signInAllowlist).where(and(eq(signInAllowlist.kind, entry.kind), eq(signInAllowlist.value, entry.value))).returning({ id: signInAllowlist.id })).length > 0;
    },
    async hosts() {
      return (await db.select({ host: instanceAllowedHosts.host }).from(instanceAllowedHosts).orderBy(instanceAllowedHosts.host)).map((row) => row.host);
    },
    async addHost(host, userId) {
      return (await db.insert(instanceAllowedHosts).values({ host, createdBy: userId }).onConflictDoNothing().returning({ id: instanceAllowedHosts.id })).length > 0;
    },
    async removeHost(host) {
      return (await db.delete(instanceAllowedHosts).where(eq(instanceAllowedHosts.host, host)).returning({ id: instanceAllowedHosts.id })).length > 0;
    },
    async admins() {
      return (await db.select({ login: instanceAdmins.login }).from(instanceAdmins).orderBy(instanceAdmins.login)).map((row) => row.login);
    },
    async addAdmin(login, userId) {
      return (await db.insert(instanceAdmins).values({ login, addedBy: userId }).onConflictDoNothing().returning({ login: instanceAdmins.login })).length > 0;
    },
    async removeAdmin(login) {
      return (await db.delete(instanceAdmins).where(eq(instanceAdmins.login, login)).returning({ login: instanceAdmins.login })).length > 0;
    },
    async rules() {
      const rows = await db
        .select({ owner: repositories.owner, name: repositories.name, effect: projectRules.effect, kind: projectRules.subjectKind, value: projectRules.subjectValue })
        .from(projectRules)
        .innerJoin(repositories, eq(repositories.id, projectRules.repositoryId))
        .orderBy(repositories.owner, repositories.name);
      return rows.map((row) => ({ project: `${row.owner}/${row.name}`, rule: row.effect === "restrict_to" && row.kind && row.value ? { effect: "restrict_to" as const, subject: { kind: row.kind, value: row.value } } : { effect: "hide" as const } }));
    },
    async addRule(repo, rule, userId) {
      const [found] = await db.select({ id: repositories.id }).from(repositories).where(sameRepo(repo));
      if (!found) return null;
      const subject = rule.effect === "hide" ? { subjectKind: null, subjectValue: null } : { subjectKind: rule.subject.kind, subjectValue: rule.subject.value };
      return (await db.insert(projectRules).values({ repositoryId: found.id, effect: rule.effect, ...subject, createdBy: userId }).onConflictDoNothing().returning({ id: projectRules.id })).length > 0;
    },
    async removeRule(repo, rule) {
      const [found] = await db.select({ id: repositories.id }).from(repositories).where(sameRepo(repo));
      if (!found) return false;
      return (await db.delete(projectRules).where(and(eq(projectRules.repositoryId, found.id), eq(projectRules.effect, rule.effect), subjectIs(rule))).returning({ id: projectRules.id })).length > 0;
    },
    staleSecrets(activeKeyId) {
      return db.select({ id: secrets.id, repositoryId: secrets.repositoryId, name: secrets.name, ciphertext: secrets.ciphertext }).from(secrets).where(ne(secrets.keyId, activeKeyId));
    },
    async saveSecret(id, ciphertext, keyId) {
      await db.update(secrets).set({ ciphertext, keyId }).where(eq(secrets.id, id));
    },
    async appCiphertexts() {
      const [row] = await db
        .select({ clientSecret: instanceSettings.clientSecretCiphertext, privateKey: instanceSettings.privateKeyCiphertext, webhookSecret: instanceSettings.webhookSecretCiphertext, authSecret: instanceSettings.authSecretCiphertext })
        .from(instanceSettings);
      return Object.fromEntries(Object.entries(row ?? {}).filter(([, value]) => typeof value === "string")) as AppCiphertexts;
    },
    async saveAppCiphertexts(values, keyId) {
      await db
        .update(instanceSettings)
        .set({
          encryptionKeyId: keyId,
          ...(values.clientSecret && { clientSecretCiphertext: values.clientSecret }),
          ...(values.privateKey && { privateKeyCiphertext: values.privateKey }),
          ...(values.webhookSecret && { webhookSecretCiphertext: values.webhookSecret }),
          ...(values.authSecret && { authSecretCiphertext: values.authSecret }),
        })
        .where(eq(instanceSettings.id, 1));
    },
  };
}
