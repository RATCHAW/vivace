// Persistence for Lambda renders: one row per (user, activity, template). A run
// that was rendered once keeps its row forever, which is what lets the UI offer a
// download instead of a re-render — and a run can hold one of each template at
// the same time, so choosing another cut doesn't throw away the last video.
import type { AwsRegion } from "@remotion/lambda/client";
import { DEFAULT_TEMPLATE_ID, TEMPLATE_IDS, type TemplateId } from "@repo/video";
import { pool } from "./db.js";
import type { RunRender } from "./schemas.js";
import {
  renderPropsHash,
  resolveRenderTarget,
  type RenderOptions,
} from "./render.js";

export interface RunRenderRow {
  userId: string;
  activityId: number;
  template: TemplateId;
  /** Remotion Lambda's id for the render, needed to poll progress. */
  renderId: string;
  /** The S3 bucket Remotion rendered into. */
  bucketName: string;
  /** Where this render was started — the row polls itself back with these
   *  rather than re-reading the environment, which may since have moved. Null
   *  only for a row written before these columns existed *and* never backfilled,
   *  which means the API had no Lambda configured at the time. */
  region: AwsRegion | null;
  functionName: string | null;
  /** Which bundle produced the file. Provenance only: it is not part of the
   *  render's identity — see `renderPropsHash`. */
  serveUrl: string | null;
  status: "rendering" | "done" | "error";
  /** 0–1. */
  progress: number;
  outputUrl: string | null;
  error: string | null;
  /** The options the render was started with, as chosen. */
  options: RenderOptions;
  /** `renderPropsHash` of template + options. A row whose hash no longer matches
   *  what the athlete has selected is a stale video, not a reusable one — which
   *  is the check that used to be `showAvatar === showAvatar`, and now survives
   *  every option added after it. */
  propsHash: string;
  createdAt: Date;
  updatedAt: Date;
}

// better-auth migrates its own tables via `pnpm auth:migrate`; this one table
// is ours, so it is created idempotently on first use instead.
let tableReady: Promise<unknown> | null = null;

function ensureTable(): Promise<unknown> {
  tableReady ??= migrate();
  return tableReady;
}

async function migrate(): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "run_render" (
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
    )`,
  );

  // CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so
  // every column added after the first deploy needs its own ALTER. `template`
  // defaults to the one template there was when these rows were written; the
  // rest are backfilled below, because a DEFAULT can't read the environment.
  await pool.query(
    `ALTER TABLE "run_render"
       ADD COLUMN IF NOT EXISTS "template" text NOT NULL DEFAULT 'run-video',
       ADD COLUMN IF NOT EXISTS "options" jsonb NOT NULL DEFAULT '{}'::jsonb,
       ADD COLUMN IF NOT EXISTS "props_hash" text NOT NULL DEFAULT '',
       ADD COLUMN IF NOT EXISTS "region" text,
       ADD COLUMN IF NOT EXISTS "function_name" text,
       ADD COLUMN IF NOT EXISTS "serve_url" text`,
  );

  // `show_avatar` became one key of `options`. Carry the answer over before
  // dropping the column — the two must never both be readable, or a stale
  // boolean starts disagreeing with the jsonb the reuse check now reads.
  await pool.query(
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'run_render' AND column_name = 'show_avatar'
       ) THEN
         UPDATE "run_render"
           SET "options" = jsonb_build_object('show_avatar', "show_avatar")
           WHERE "options" = '{}'::jsonb;
         ALTER TABLE "run_render" DROP COLUMN "show_avatar";
       END IF;
     END $$`,
  );

  // A row with no hash is every row that existed before renders had one. Left
  // empty it would match nothing, so the first visit to each already-rendered
  // run would offer a re-render of a video we already have. There is one option
  // and it is a boolean, so the whole space is two hashes per template.
  for (const template of TEMPLATE_IDS) {
    for (const showAvatar of [true, false]) {
      await pool.query(
        `UPDATE "run_render" SET "props_hash" = $1
           WHERE "props_hash" = '' AND "template" = $2
             AND COALESCE(("options"->>'show_avatar')::boolean, false) = $3`,
        [renderPropsHash(template, { showAvatar }), template, showAvatar],
      );
    }
  }

  // Where those renders ran. Nothing has moved yet at the moment this runs —
  // the environment still holds what started them — so this is the last chance
  // to record it before an override sends a later render somewhere else.
  const target = resolveRenderTarget(DEFAULT_TEMPLATE_ID);
  if (target) {
    await pool.query(
      `UPDATE "run_render"
         SET "region" = $1, "function_name" = $2, "serve_url" = $3
         WHERE "function_name" IS NULL`,
      [target.region, target.functionName, target.serveUrl],
    );
  }

  // A run can hold one render per template, so the template joins the key.
  // Guarded on the column count rather than run unconditionally: dropping and
  // re-adding a primary key rebuilds its index, and this runs on first use in
  // every process.
  await pool.query(
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_index i
         JOIN pg_class c ON c.oid = i.indrelid
         WHERE c.relname = 'run_render' AND i.indisprimary AND i.indnatts = 3
       ) THEN
         ALTER TABLE "run_render" DROP CONSTRAINT IF EXISTS "run_render_pkey";
         ALTER TABLE "run_render"
           ADD PRIMARY KEY ("user_id", "activity_id", "template");
       END IF;
     END $$`,
  );
}

interface DbRow {
  user_id: string;
  activity_id: string; // bigint comes back as a string
  template: string;
  render_id: string;
  bucket_name: string;
  region: string | null;
  function_name: string | null;
  serve_url: string | null;
  status: string;
  progress: number;
  output_url: string | null;
  error: string | null;
  options: { show_avatar?: boolean } | null;
  props_hash: string;
  created_at: Date;
  updated_at: Date;
}

function fromDb(row: DbRow): RunRenderRow {
  return {
    userId: row.user_id,
    activityId: Number(row.activity_id),
    template: row.template as TemplateId,
    renderId: row.render_id,
    bucketName: row.bucket_name,
    // Null only for a row the backfill couldn't fill, which means Lambda was
    // unconfigured — so there was no render either. The progress route still
    // falls back to the resolved target rather than trusting that.
    region: row.region as AwsRegion | null,
    functionName: row.function_name,
    serveUrl: row.serve_url,
    status: row.status as RunRenderRow["status"],
    progress: row.progress,
    outputUrl: row.output_url,
    error: row.error,
    options: { showAvatar: row.options?.show_avatar ?? false },
    propsHash: row.props_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The row as the API serves it (the `RunRender` schema). */
export function toRunRender(row: RunRenderRow): RunRender {
  return {
    activity_id: row.activityId,
    template: row.template,
    status: row.status,
    show_avatar: row.options.showAvatar,
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
  template: TemplateId,
): Promise<RunRenderRow | null> {
  await ensureTable();
  const { rows } = await pool.query<DbRow>(
    `SELECT * FROM "run_render"
       WHERE "user_id" = $1 AND "activity_id" = $2 AND "template" = $3`,
    [userId, activityId, template],
  );
  return rows[0] ? fromDb(rows[0]) : null;
}

/** Records a freshly started render, replacing any previous attempt at the same
 *  template. Another template's render of the same run is a different row. */
export async function saveStartedRender(input: {
  userId: string;
  activityId: number;
  template: TemplateId;
  renderId: string;
  bucketName: string;
  region: AwsRegion;
  functionName: string;
  serveUrl: string;
  options: RenderOptions;
  propsHash: string;
}): Promise<RunRenderRow> {
  await ensureTable();
  const { rows } = await pool.query<DbRow>(
    `INSERT INTO "run_render"
       ("user_id", "activity_id", "template", "render_id", "bucket_name",
        "region", "function_name", "serve_url", "status", "progress",
        "options", "props_hash")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'rendering', 0, $9, $10)
     ON CONFLICT ("user_id", "activity_id", "template") DO UPDATE SET
       "render_id" = EXCLUDED."render_id",
       "bucket_name" = EXCLUDED."bucket_name",
       "region" = EXCLUDED."region",
       "function_name" = EXCLUDED."function_name",
       "serve_url" = EXCLUDED."serve_url",
       "status" = 'rendering',
       "progress" = 0,
       "output_url" = NULL,
       "error" = NULL,
       "options" = EXCLUDED."options",
       "props_hash" = EXCLUDED."props_hash",
       "created_at" = now(),
       "updated_at" = now()
     RETURNING *`,
    [
      input.userId,
      input.activityId,
      input.template,
      input.renderId,
      input.bucketName,
      input.region,
      input.functionName,
      input.serveUrl,
      JSON.stringify({ show_avatar: input.options.showAvatar }),
      input.propsHash,
    ],
  );
  return fromDb(rows[0]);
}

/** Applies a progress poll's outcome. */
export async function updateRunRender(
  userId: string,
  activityId: number,
  template: TemplateId,
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
       "status" = $4,
       "progress" = $5,
       "output_url" = $6,
       "error" = $7,
       "updated_at" = now()
     WHERE "user_id" = $1 AND "activity_id" = $2 AND "template" = $3
     RETURNING *`,
    [
      userId,
      activityId,
      template,
      update.status,
      update.progress,
      update.outputUrl,
      update.error,
    ],
  );
  return fromDb(rows[0]);
}
