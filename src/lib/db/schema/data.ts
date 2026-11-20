import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { repositories } from "./repos";

// Project secrets: write-only, AES-256-GCM ciphertext tagged with its key id, bound to the hosts it may be sent to.
export const secrets = pgTable(
  "secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyId: text("key_id").notNull(),
    boundHosts: text("bound_hosts").array().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("secrets_repository_name_uq").on(t.repositoryId, t.name),
    // Background re-encryption after a key rotation.
    index("secrets_key_id_idx").on(t.keyId),
    check("secrets_bound_hosts_not_empty", sql`cardinality(${t.boundHosts}) > 0`),
  ],
);

// Cached source and GitHub responses (stale-while-revalidate). Entries unused for 7 days are purged daily.
export const httpCache = pgTable(
  "http_cache",
  {
    key: text("key").primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    body: jsonb("body"),
    etag: text("etag"),
    status: integer("status").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("http_cache_repository_idx").on(t.repositoryId), index("http_cache_last_accessed_idx").on(t.lastAccessedAt)],
);

// Agent tokens: shown once, stored as a SHA-256 hash, mandatory expiry (90 days by default, 1 year maximum).
export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agent_tokens_hash_uq").on(t.tokenHash),
    index("agent_tokens_user_idx").on(t.userId),
    check("agent_tokens_max_one_year", sql`${t.expiresAt} <= ${t.createdAt} + interval '366 days'`),
  ],
);

// Append-only audit trail, kept 1 year by default. Actor login is a snapshot: it survives user deletion.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorLogin: text("actor_login"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    // Names only, never secret values.
    metadata: jsonb("metadata"),
  },
  (t) => [
    index("audit_log_at_idx").on(t.at),
    index("audit_log_action_at_idx").on(t.action, t.at),
    index("audit_log_actor_idx").on(t.actorUserId, t.at),
  ],
);
