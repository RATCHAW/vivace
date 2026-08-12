// Persistence for Lambda renders: one row per (user, activity). A run that was
// rendered once keeps its row forever, which is what lets the UI offer a
// download instead of a re-render.
import { pool } from "./db.js";
import type { RunRender } from "./schemas.js";

export interface RunRenderRow {
  userId: string;
  activityId: number;
  /** Remotion Lambda's id for the render, needed to poll progress. */
  renderId: string;
  /** The S3 bucket Remotion rendered into. */
  bucketName: string;
  status: "rendering" | "done" | "error";
  /** 0–1. */
  progress: number;
  outputUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// better-auth migrates its own tables via `pnpm auth:migrate`; this one table
// is ours, so it is created idempotently on first use instead.
let tableReady: Promise<unknown> | null = null;

function ensureTable(): Promise<unknown> {
  tableReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS "run_render" (
      "user_id" text NOT NULL,
      "activity_id" bigint NOT NULL,
      "render_id" text NOT NULL,
      "bucket_name" text NOT NULL,
      "status" text NOT NULL,
      "progress" real NOT NULL DEFAULT 0,
      "output_url" text,
      "error" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("user_id", "activity_id")
    )
  `);
  return tableReady;
}

interface DbRow {
  user_id: string;
  activity_id: string; // bigint comes back as a string
  render_id: string;
  bucket_name: string;
  status: string;
  progress: number;
  output_url: string | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

function fromDb(row: DbRow): RunRenderRow {
  return {
    userId: row.user_id,
    activityId: Number(row.activity_id),
    renderId: row.render_id,
    bucketName: row.bucket_name,
    status: row.status as RunRenderRow["status"],
    progress: row.progress,
    outputUrl: row.output_url,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The row as the API serves it (the `RunRender` schema). */
export function toRunRender(row: RunRenderRow): RunRender {
  return {
    activity_id: row.activityId,
    status: row.status,
    progress: row.progress,
    output_url: row.outputUrl,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function getRunRender(
  userId: string,
  activityId: number,
): Promise<RunRenderRow | null> {
  await ensureTable();
  const { rows } = await pool.query<DbRow>(
    `SELECT * FROM "run_render" WHERE "user_id" = $1 AND "activity_id" = $2`,
    [userId, activityId],
  );
  return rows[0] ? fromDb(rows[0]) : null;
}

/** Records a freshly started render, replacing any previous attempt. */
export async function saveStartedRender(input: {
  userId: string;
  activityId: number;
  renderId: string;
  bucketName: string;
}): Promise<RunRenderRow> {
  await ensureTable();
  const { rows } = await pool.query<DbRow>(
    `INSERT INTO "run_render"
       ("user_id", "activity_id", "render_id", "bucket_name", "status", "progress")
     VALUES ($1, $2, $3, $4, 'rendering', 0)
     ON CONFLICT ("user_id", "activity_id") DO UPDATE SET
       "render_id" = EXCLUDED."render_id",
       "bucket_name" = EXCLUDED."bucket_name",
       "status" = 'rendering',
       "progress" = 0,
       "output_url" = NULL,
       "error" = NULL,
       "created_at" = now(),
       "updated_at" = now()
     RETURNING *`,
    [input.userId, input.activityId, input.renderId, input.bucketName],
  );
  return fromDb(rows[0]);
}

/** Applies a progress poll's outcome. */
export async function updateRunRender(
  userId: string,
  activityId: number,
  update: {
    status: RunRenderRow["status"];
    progress: number;
    outputUrl: string | null;
    error: string | null;
  },
): Promise<RunRenderRow> {
  await ensureTable();
  const { rows } = await pool.query<DbRow>(
    `UPDATE "run_render" SET
       "status" = $3,
       "progress" = $4,
       "output_url" = $5,
       "error" = $6,
       "updated_at" = now()
     WHERE "user_id" = $1 AND "activity_id" = $2
     RETURNING *`,
    [userId, activityId, update.status, update.progress, update.outputUrl, update.error],
  );
  return fromDb(rows[0]);
}
