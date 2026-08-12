import "dotenv/config";
import pg from "pg";

/** One pool for the process — better-auth and the app's own tables share it. */
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
