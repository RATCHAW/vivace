// Persistence for Lambda renders: one row per (user, activity, template). A run
// that was rendered once keeps its row forever, which is what lets the UI offer a
// download instead of a re-render — and a run can hold one of each template at
// the same time, so choosing another cut doesn't throw away the last video.
import type { AwsRegion } from "@remotion/lambda/client";
import {
  DEFAULT_THEME,
  isThemeName,
  type TemplateId,
  type ThemeName,
} from "@repo/video";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { runRender } from "./db/schema/render.js";
import type { RunRender } from "./schemas.js";
import type { RenderOptions } from "./render.js";

type RunRenderSelect = typeof runRender.$inferSelect;

export interface RunRenderRow extends Omit<RunRenderSelect, "options"> {
  /** The options the render was started with, as chosen — camelCase, unlike the
   *  snake_case shape stored in the jsonb column. */
  options: RenderOptions;
}

/** A stored theme name, or the default for a row written before themes were an
 *  option (or by a version of us that has since dropped one). */
function themeOf(stored: string | undefined): ThemeName {
  return stored != null && isThemeName(stored) ? stored : DEFAULT_THEME;
}

function fromDb(row: RunRenderSelect): RunRenderRow {
  return {
    ...row,
    options: {
      showAvatar: row.options.show_avatar ?? false,
      // A row written before themes existed carries none, and the film it
      // describes was cut in the default one.
      theme: themeOf(row.options.theme),
    },
  };
}

/** The row as the API serves it (the `RunRender` schema). */
export function toRunRender(row: RunRenderRow): RunRender {
  return {
    activity_id: row.activityId,
    template: row.template,
    status: row.status,
    show_avatar: row.options.showAvatar,
    theme: row.options.theme,
    progress: row.progress,
    output_url: row.outputUrl,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function keyed(userId: string, activityId: number, template: TemplateId) {
  return and(
    eq(runRender.userId, userId),
    eq(runRender.activityId, activityId),
    eq(runRender.template, template),
  );
}

export async function getRunRender(
  userId: string,
  activityId: number,
  template: TemplateId,
): Promise<RunRenderRow | null> {
  const [row] = await db
    .select()
    .from(runRender)
    .where(keyed(userId, activityId, template));
  return row ? fromDb(row) : null;
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
  const started = {
    renderId: input.renderId,
    bucketName: input.bucketName,
    region: input.region,
    functionName: input.functionName,
    serveUrl: input.serveUrl,
    status: "rendering" as const,
    progress: 0,
    outputUrl: null,
    error: null,
    options: {
      show_avatar: input.options.showAvatar,
      theme: input.options.theme,
    },
    propsHash: input.propsHash,
  };

  const [row] = await db
    .insert(runRender)
    .values({
      userId: input.userId,
      activityId: input.activityId,
      template: input.template,
      ...started,
    })
    .onConflictDoUpdate({
      target: [runRender.userId, runRender.activityId, runRender.template],
      // A re-render starts the clock again, so `created_at` moves with it — the
      // row describes this attempt, not the first one ever made.
      set: { ...started, createdAt: sql`now()`, updatedAt: sql`now()` },
    })
    .returning();
  return fromDb(row);
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
  const [row] = await db
    .update(runRender)
    .set({ ...update, updatedAt: sql`now()` })
    .where(keyed(userId, activityId, template))
    .returning();
  return fromDb(row);
}
