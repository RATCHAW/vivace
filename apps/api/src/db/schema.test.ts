// The auth half of this schema is a transcription, not a design, and these are
// the two ways it can silently stop being one.
//
// Neither test needs a database: both read the Drizzle table definitions and
// what better-auth says it expects, which is why they can live in the ordinary
// suite that CI runs with no Postgres anywhere.
import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getSchema } from "better-auth/db";
import { describe, expect, it } from "vitest";
import { auth } from "../auth.js";
import { account, session, user, verification } from "./schema/auth.js";

const AUTH_TABLES: Record<string, PgTable> = { user, session, account, verification };

/**
 * What is actually in the production database.
 *
 * better-auth's built-in Kysely adapter quoted its field names verbatim when it
 * created these tables, so the live columns are camelCase. `auth generate`
 * emits snake_case — running it and pasting the result over src/db/schema/auth.ts
 * would compile, would migrate cleanly onto an empty database, and would not
 * find a single existing athlete. This list is what makes that a failing test
 * rather than a production incident.
 */
const LIVE_COLUMNS: Record<string, string[]> = {
  user: ["id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt"],
  session: [
    "id",
    "expiresAt",
    "token",
    "createdAt",
    "updatedAt",
    "ipAddress",
    "userAgent",
    "userId",
  ],
  account: [
    "id",
    "accountId",
    "providerId",
    "userId",
    "accessToken",
    "refreshToken",
    "idToken",
    "accessTokenExpiresAt",
    "refreshTokenExpiresAt",
    "scope",
    "password",
    "createdAt",
    "updatedAt",
  ],
  verification: [
    "id",
    "identifier",
    "value",
    "expiresAt",
    "createdAt",
    "updatedAt",
  ],
};

describe("better-auth tables", () => {
  it.each(Object.keys(LIVE_COLUMNS))(
    "%s keeps the column names already in production",
    (table) => {
      const columns = Object.values(getTableColumns(AUTH_TABLES[table])).map(
        (column) => column.name,
      );
      expect(columns.sort()).toEqual([...LIVE_COLUMNS[table]].sort());
    },
  );

  it("covers every field better-auth asks the adapter for", () => {
    // The Drizzle adapter resolves a model's fields against the *keys* of the
    // table object, so a field better-auth knows about and this schema doesn't
    // is a runtime "column not found" — from a plugin added without regenerating,
    // for instance.
    const expected = getSchema(auth.options);

    for (const [model, definition] of Object.entries(expected)) {
      const table = AUTH_TABLES[model];
      expect(table, `no Drizzle table for better-auth model "${model}"`).toBeDefined();
      expect(getTableName(table)).toBe(model);

      const keys = new Set(Object.keys(getTableColumns(table)));
      for (const field of Object.keys(definition.fields)) {
        expect(keys, `${model}.${field} is missing from the Drizzle schema`).toContain(
          field,
        );
      }
    }
  });
});
