import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const allowlistKind = pgEnum("allowlist_kind", ["org", "team", "user"]);

// Singleton row (id is always 1): GitHub App credentials and first-run state.
// Secrets are AES-256-GCM ciphertext tagged with the key id, so rotation can find what to re-encrypt.
export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: integer("id").primaryKey().default(1),
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    githubAppId: text("github_app_id"),
    githubAppSlug: text("github_app_slug"),
    githubClientId: text("github_client_id"),
    clientSecretCiphertext: text("client_secret_ciphertext"),
    privateKeyCiphertext: text("private_key_ciphertext"),
    webhookSecretCiphertext: text("webhook_secret_ciphertext"),
    encryptionKeyId: text("encryption_key_id"),
    pollIntervalSeconds: integer("poll_interval_seconds").notNull().default(300),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("instance_settings_singleton", sql`${t.id} = 1`),
    check("instance_settings_poll_min", sql`${t.pollIntervalSeconds} >= 60`),
  ],
);

// Additional admins by GitHub username (they may not have signed in yet). Stored lowercased.
export const instanceAdmins = pgTable(
  "instance_admins",
  {
    login: text("login").primaryKey(),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("instance_admins_lowercase", sql`${t.login} = lower(${t.login})`)],
);

// Level 1 of the access policy: who may sign in at all. `value` is lowercased:
// an organization login, "org/team-slug" for a team, or a username.
export const signInAllowlist = pgTable(
  "sign_in_allowlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: allowlistKind("kind").notNull(),
    value: text("value").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sign_in_allowlist_kind_value_uq").on(t.kind, t.value),
    check("sign_in_allowlist_lowercase", sql`${t.value} = lower(${t.value})`),
  ],
);

// Instance-wide allowed private hosts or CIDR ranges (admin only). Project-level hosts live in `project_allowed_hosts`.
export const instanceAllowedHosts = pgTable(
  "instance_allowed_hosts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    host: text("host").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("instance_allowed_hosts_host_uq").on(t.host), index("instance_allowed_hosts_created_idx").on(t.createdAt)],
);
