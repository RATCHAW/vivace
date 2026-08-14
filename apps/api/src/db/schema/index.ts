// The whole database in one import. `drizzle-kit` reads this file (see
// drizzle.config.ts), `db` is typed against it, and better-auth's Drizzle
// adapter is handed the auth tables out of it — so a table that isn't exported
// here does not exist as far as migrations are concerned.
export * from "./auth.js";
export * from "./coach.js";
export * from "./render.js";
export * from "./webhook.js";
