// One row per (user, activity, template). A run that was rendered once keeps its
// row forever, which is what lets the UI offer a download instead of a
// re-render — and a run can hold one of each template at the same time, so
// choosing another cut doesn't throw away the last video.
import type { AwsRegion } from "@remotion/lambda/client";
import type { TemplateId, ThemeName } from "@repo/video";
import {
  bigint,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

/** The options column as it is *stored*, which is snake_case — these rows
 *  predate this schema file and their keys are not up for renaming. The
 *  camelCase `RenderOptions` the rest of the API speaks is mapped in
 *  render-store.ts. */
export interface StoredRenderOptions {
  show_avatar?: boolean;
  theme?: ThemeName;
}

export const runRender = pgTable(
  "run_render",
  {
    userId: text("user_id").notNull(),
    activityId: bigint("activity_id", { mode: "number" }).notNull(),
    template: text("template")
      .$type<TemplateId>()
      .notNull()
      .default("run-video"),
    /** Remotion Lambda's id for the render, needed to poll progress. */
    renderId: text("render_id").notNull(),
    /** The S3 bucket Remotion rendered into. */
    bucketName: text("bucket_name").notNull(),
    /** Where this render was started — the row polls itself back with these
     *  rather than re-reading the environment, which may since have moved. */
    region: text("region").$type<AwsRegion>(),
    functionName: text("function_name"),
    /** Which bundle produced the file. Provenance only: it is not part of the
     *  render's identity — see `renderPropsHash`. */
    serveUrl: text("serve_url"),
    status: text("status").$type<"rendering" | "done" | "error">().notNull(),
    /** 0–1. */
    progress: real("progress").notNull().default(0),
    outputUrl: text("output_url"),
    error: text("error"),
    options: jsonb("options")
      .$type<StoredRenderOptions>()
      .notNull()
      .default({}),
    /** `renderPropsHash` of template + options. A row whose hash no longer
     *  matches what the athlete has selected is a stale video, not a reusable
     *  one. */
    propsHash: text("props_hash").notNull().default(""),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  // The template joins the key, which is what lets a run hold one render of each.
  (table) => [
    primaryKey({ columns: [table.userId, table.activityId, table.template] }),
  ],
);
