import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const githubPermission = pgEnum("github_permission", ["none", "read", "triage", "write", "maintain", "admin"]);
export const ruleEffect = pgEnum("rule_effect", ["hide", "restrict_to"]);
export const subjectKind = pgEnum("subject_kind", ["user", "team"]);

export const githubInstallations = pgTable(
  "github_installations",
  {
    id: bigint("id", { mode: "number" }).primaryKey(), // GitHub installation id
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("github_installations_account_idx").on(t.accountLogin)],
);

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    installationId: bigint("installation_id", { mode: "number" })
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull(),
    isPrivate: boolean("is_private").notNull(),
    archived: boolean("archived").notNull().default(false),
    // Discovery: which file was found at the root of the default branch (null = none).
    configFile: text("config_file"),
    configSha: text("config_sha"),
    configEtag: text("config_etag"),
    // Last valid parsed config keeps rendering while `configError` (structured errors) is shown above it.
    lastValidConfig: jsonb("last_valid_config"),
    configError: jsonb("config_error"),
    configCheckedAt: timestamp("config_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("repositories_github_id_uq").on(t.githubId),
    uniqueIndex("repositories_full_name_uq").on(sql`lower(${t.owner})`, sql`lower(${t.name})`),
    index("repositories_installation_idx").on(t.installationId),
    // Project list and polling only look at repositories that have a config.
    index("repositories_with_config_idx")
      .on(t.configCheckedAt)
      .where(sql`${t.configFile} is not null`),
    check("repositories_config_file_known", sql`${t.configFile} is null or ${t.configFile} in ('.hub.yml', '.repo-hub.yml')`),
  ],
);

// Level 2 of the access policy. `hide` has no subject; `restrict_to` has one row per allowed user or team.
export const projectRules = pgTable(
  "project_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    effect: ruleEffect("effect").notNull(),
    subjectKind: subjectKind("subject_kind"),
    subjectValue: text("subject_value"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("project_rules_uq").on(t.repositoryId, t.effect, t.subjectKind, t.subjectValue).nullsNotDistinct(),
    index("project_rules_repository_idx").on(t.repositoryId),
    check(
      "project_rules_subject_shape",
      sql`(${t.effect} = 'hide' and ${t.subjectKind} is null and ${t.subjectValue} is null)
        or (${t.effect} = 'restrict_to' and ${t.subjectKind} is not null and ${t.subjectValue} is not null)`,
    ),
  ],
);

export const projectAllowedHosts = pgTable(
  "project_allowed_hosts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    host: text("host").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("project_allowed_hosts_uq").on(t.repositoryId, t.host)],
);

// GitHub permission of a user on a repository, cached 5 minutes. Missing or expired row = ask GitHub; failure = deny.
export const permissionCache = pgTable(
  "permission_cache",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    permission: githubPermission("permission").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.repositoryId] }),
    // Webhook invalidation by repository, and purge of expired rows.
    index("permission_cache_repository_idx").on(t.repositoryId),
    index("permission_cache_expires_idx").on(t.expiresAt),
  ],
);

// Delivery ids already processed (replay protection); purged after a few days.
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    deliveryId: text("delivery_id").primaryKey(),
    event: text("event").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_deliveries_received_idx").on(t.receivedAt)],
);
