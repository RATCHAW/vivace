// drizzle-kit's entry point: `pnpm db:generate` diffs src/db/schema against the
// snapshot in drizzle/meta and writes the next migration.
//
// No `casing` setting on purpose. Every column in src/db/schema names itself,
// because the two halves of this database disagree: better-auth's tables carry
// camelCase columns ("userId", "createdAt") and ours carry snake_case. A global
// casing rule would have to be wrong for one of them.
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    // Only read by the commands that talk to a database (`migrate`, `push`,
    // `studio`). `generate` diffs snapshots and needs no connection at all.
    url: process.env.DATABASE_URL ?? "",
  },
  // One statement per breakpoint, so a failed migration says which statement.
  breakpoints: true,
  strict: true,
  verbose: true,
});
