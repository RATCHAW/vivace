import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const production =
  process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";

if (production && !connectionString) {
  throw new Error("DATABASE_URL must be set in production");
}

/** One pool for the process — better-auth and the app's own tables share it. */
export const pool = new pg.Pool({ connectionString });
