import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const connectionString = process.env.DATABASE_URL;
const production =
  process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";

if (production && !connectionString) {
  throw new Error("DATABASE_URL must be set in production");
}

/**
 * One pool for the process — Drizzle, better-auth and the migrator share it.
 *
 * Still exported as a `pg.Pool` rather than hidden behind Drizzle: `pg` is what
 * opens the sockets, so this is the object that has to be ended on shutdown, and
 * `drizzle-seed` wants the same client the app uses.
 */
export const pool = new pg.Pool({ connectionString });

/**
 * The typed handle every store reads and writes through.
 *
 * `schema` is passed so the relational query API (`db.query.coachThread…`) is
 * available; the stores mostly use the SQL-like builder, which doesn't need it.
 */
export const db = drizzle({ client: pool, schema });

export type Db = typeof db;

export * as schema from "./schema/index.js";
