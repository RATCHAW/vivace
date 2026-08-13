// The Remotion Lambda glue: start a render of the run-video composition and
// poll its progress. Only the lightweight client submodule is imported — the
// API never bundles or renders anything itself.
import {
  getRenderProgress,
  renderMediaOnLambda,
  type AwsRegion,
} from "@remotion/lambda/client";
import type { Run, RunStreams } from "./schemas.js";

/** Must match RUN_VIDEO_COMPOSITION_ID in apps/web/src/remotion/Root.tsx. */
const COMPOSITION_ID = "run-video";

export interface RenderConfig {
  region: AwsRegion;
  functionName: string;
  serveUrl: string;
}

/**
 * Null until Lambda is deployed and configured — the routes turn that into a
 * 503 with instructions instead of a crash. See scripts/deploy-remotion.ts in
 * apps/web for where these values come from.
 */
export function getRenderConfig(): RenderConfig | null {
  const functionName = process.env.REMOTION_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_SERVE_URL;
  if (!functionName || !serveUrl) return null;
  return {
    region: (process.env.REMOTION_AWS_REGION ?? "us-east-1") as AwsRegion,
    functionName,
    serveUrl,
  };
}

/** Kicks off a Lambda render; the MP4 lands in Remotion's S3 bucket. */
export async function startLambdaRender(
  config: RenderConfig,
  run: Run,
  streams: RunStreams,
  /** The athlete's Strava picture URL when the avatar option is on, else "". */
  avatarUrl: string,
): Promise<{ renderId: string; bucketName: string }> {
  const { renderId, bucketName } = await renderMediaOnLambda({
    ...config,
    composition: COMPOSITION_ID,
    inputProps: {
      activity: run,
      streams,
      // The server-side token; the browser's VITE_MAPBOX_TOKEN never leaves
      // the client. Empty renders the plain route canvas fallback.
      mapboxToken: process.env.MAPBOX_TOKEN ?? "",
      avatarUrl,
    },
    codec: "h264",
    // Public so output_url is directly downloadable from the browser.
    privacy: "public",
    // Mapbox needs WebGL; swangle is Lambda's software OpenGL renderer.
    chromiumOptions: { gl: "swangle" },
    // Every frame waits for map tiles over the network, so give delayRender
    // more room than the 30s default.
    timeoutInMilliseconds: 120_000,
    downloadBehavior: { type: "download", fileName: `${slugify(run.name)}.mp4` },
  });
  return { renderId, bucketName };
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "run";
}

export interface LambdaProgress {
  status: "rendering" | "done" | "error";
  /** 0–1. */
  progress: number;
  outputUrl: string | null;
  error: string | null;
}

/** One progress poll, flattened to what the run_render row stores. */
export async function fetchLambdaProgress(
  config: RenderConfig,
  render: { renderId: string; bucketName: string },
): Promise<LambdaProgress> {
  const progress = await getRenderProgress({
    region: config.region,
    functionName: config.functionName,
    renderId: render.renderId,
    bucketName: render.bucketName,
  });

  if (progress.fatalErrorEncountered) {
    return {
      status: "error",
      progress: progress.overallProgress,
      outputUrl: null,
      error: progress.errors[0]?.message ?? "Render failed on Lambda",
    };
  }
  if (progress.done) {
    return {
      status: "done",
      progress: 1,
      outputUrl: progress.outputFile,
      error: null,
    };
  }
  return {
    status: "rendering",
    progress: progress.overallProgress,
    outputUrl: null,
    error: null,
  };
}
