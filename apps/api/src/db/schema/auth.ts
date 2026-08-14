// better-auth's four tables, transcribed rather than invented.
//
// The library used to own this schema outright — it was handed a `pg.Pool` and
// migrated itself through its Kysely adapter. Moving to `drizzleAdapter` moves
// ownership here, which is only safe if the definitions match what is already in
// the production database column for column. They do: this file was written
// against a `pg_dump` of a database built the old way, and `db.test.ts` fails if
// it ever stops agreeing with what better-auth asks the adapter for.
//
// Hence the camelCase column names. Kysely quoted better-auth's field names
// verbatim, so the live columns really are "userId" and "createdAt" — a
// snake_case rewrite here would compile, migrate cleanly onto an empty database,
// and silently fail to find a single existing account in production.
//
// Which is what `pnpm --filter @repo/api auth:generate` will hand you: it emits
// snake_case. It writes to .better-auth-schema.ts (gitignored) rather than over
// this file for exactly that reason — read it to see whether a plugin has added
// a field, then add that field here by hand.
import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** `timestamptz`, which is what the Kysely adapter created for every date. */
const tz = { withTimezone: true } as const;

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // The athlete's Strava id behind a placeholder domain — Strava never exposes
  // a real address. See `getUserInfo` in auth.ts.
  email: text("email").notNull().unique("user_email_key"),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", tz).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", tz).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", tz).notNull(),
    token: text("token").notNull().unique("session_token_key"),
    createdAt: timestamp("createdAt", tz).notNull().defaultNow(),
    // No default, unlike createdAt: better-auth writes this on every refresh and
    // the live column has none either.
    updatedAt: timestamp("updatedAt", tz).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    // For Strava this is the athlete id as a string, which is what
    // `userForAthlete` looks a webhook delivery up by.
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", tz),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", tz),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", tz).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", tz).notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", tz).notNull(),
    createdAt: timestamp("createdAt", tz).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", tz).notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// Declared for the relational query API only — better-auth does its own joins
// through the adapter and never reads these.
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
