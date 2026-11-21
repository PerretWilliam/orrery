import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, boolean, bigint } from "drizzle-orm/pg-core";

// Tables owned by Better Auth (names and columns follow its core schema).
// `github_id` and `login` are hub additions: the admin policy and ORRERY_ADMINS match on them.
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    githubId: bigint("github_id", { mode: "number" }),
    login: text("login"),
    // Set when GitHub refuses to renew this user's tokens: sessions and agent tokens stay suspended until the next sign-in.
    authSuspendedAt: timestamp("auth_suspended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_email_uq").on(t.email),
    uniqueIndex("user_github_id_uq").on(t.githubId),
    // Usernames are case-insensitive on GitHub; allowlist and admin lookups use the lowercased form.
    uniqueIndex("user_login_lower_uq").on(sql`lower(${t.login})`),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("session_token_uq").on(t.token),
    index("session_user_id_idx").on(t.userId),
    // Purge of expired sessions.
    index("session_expires_at_idx").on(t.expiresAt),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Better Auth encrypts the OAuth tokens itself (account.encryptOAuthTokens).
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("account_provider_account_uq").on(t.providerId, t.accountId),
    index("account_user_id_idx").on(t.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier), index("verification_expires_at_idx").on(t.expiresAt)],
);
