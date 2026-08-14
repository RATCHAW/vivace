// The Remotion Lambda glue: work out which function and which bundle a template
// renders on, start the render, and poll its progress. Only the lightweight
// client submodule is imported — the API never bundles or renders anything
// itself, and `@repo/video` is imported through its React-free entry.
import { createHash } from "node:crypto";
import {
  getRenderProgress,
  renderMediaOnLambda,
  type AwsRegion,
} from "@remotion/lambda/client";
import {
  DEFAULT_THEME,
  functionNameEnvVar,
  getProfile,
  getTemplate,
  serveUrlEnvVar,
  type TemplateId,
  type ThemeName,
  type VideoTemplate,
} from "@repo/video";
import type { Run, RunStreams } from "./schemas.js";

/** Everything one template needs to reach Lambda. */
export interface RenderTarget {
  template: VideoTemplate;
  region: AwsRegion;
  /** The function for this template's *profile* — the axis that costs money. */
  functionName: string;
  /** The bundle holding this template's composition. */
  serveUrl: string;
}

/** What the athlete chose, as it is stored and hashed. */
export interface RenderOptions {
  showAvatar: boolean;
  theme: ThemeName;
}

const DEFAULT_REGION = "us-east-1";

export function renderRegion(): AwsRegion {
  return (process.env.REMOTION_AWS_REGION ?? DEFAULT_REGION) as AwsRegion;
}

/**
 * Where a template renders, or null when Lambda isn't configured — the routes
 * turn that into a 503 with instructions instead of a crash.
 *
 * Both halves resolve the same way: a specific override first, the shared value
 * second. Unset overrides are the normal state — one function, one site bundle
 * holding every composition — and that is what keeps adding a template free.
 * The overrides are the escape hatch for the day a template needs different
 * iron (`REMOTION_FUNCTION_NAME_LIGHT`) or a bundle of its own
 * (`REMOTION_SERVE_URL_<TEMPLATE>`); see scripts/deploy-remotion.ts in apps/web.
 */
export function resolveRenderTarget(id: TemplateId): RenderTarget | null {
  const template = getTemplate(id);
  const functionName =
    process.env[functionNameEnvVar(template.profile)] ??
    process.env.REMOTION_FUNCTION_NAME;
  const serveUrl =
    process.env[serveUrlEnvVar(template.id)] ?? process.env.REMOTION_SERVE_URL;
  if (!functionName || !serveUrl) return null;
  return { template, region: renderRegion(), functionName, serveUrl };
}

/**
 * A render's identity: same hash, same video, so the stored MP4 can be handed
 * back instead of paying Lambda again.
 *
 * Deliberately *not* a hash of the resolved input props. The avatar URL is one
 * of those, and reading it costs a Strava request — which would then be spent on
 * every reuse check, including the ones that hand back a file we already have.
 * The serve URL is left out too: redeploying the bundle would otherwise mark
 * every athlete's finished video stale and offer them a re-render they never
 * asked for. What identifies the cut is the template and the options.
 */
export function renderPropsHash(
  template: TemplateId,
  options: RenderOptions,
): string {
  const canonical = JSON.stringify({
    template,
    // Spelled out rather than serialised wholesale, so adding a field to
    // `RenderOptions` is a deliberate decision about invalidating stored videos.
    show_avatar: options.showAvatar,
    // The default theme is left out of the hash entirely, so every video
    // rendered before themes existed still hashes to what it hashed to then —
    // adding the option didn't mark a single athlete's finished film stale.
    ...(options.theme === DEFAULT_THEME ? {} : { theme: options.theme }),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/** Kicks off a Lambda render; the MP4 lands in Remotion's S3 bucket. */
export async function startLambdaRender(
  target: RenderTarget,
  run: Run,
  streams: RunStreams,
  /** The athlete's Strava picture URL when the avatar option is on, else "". */
  avatarUrl: string,
  /** The look to cut it in; a template that isn't themed ignores it. */
  theme: ThemeName = DEFAULT_THEME,
): Promise<{ renderId: string; bucketName: string }> {
  const { template, region, functionName, serveUrl } = target;
  const profile = getProfile(template);

  const { renderId, bucketName } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: template.compositionId,
    inputProps: {
      activity: run,
      streams,
      // The server-side token; the browser's VITE_MAPBOX_TOKEN never leaves
      // the client. Empty renders the plain route canvas fallback, and a
      // template that draws no map never sees it at all.
      mapboxToken: template.usesMap ? (process.env.MAPBOX_TOKEN ?? "") : "",
      avatarUrl,
      theme,
    },
    codec: "h264",
    // Public so output_url is directly downloadable from the browser.
    privacy: "public",
    // Software OpenGL for the templates that need WebGL; Remotion's default
    // for the ones that don't.
    chromiumOptions: profile.gl ? { gl: profile.gl } : undefined,
    // How long one frame may hold `delayRender` open. Map frames wait on tiles
    // over the network and need far more than the 30s default.
    timeoutInMilliseconds: profile.delayRenderTimeoutInMilliseconds,
    downloadBehavior: {
      type: "download",
      fileName: `${slugify(run.name)}.mp4`,
    },
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

/**
 * One progress poll, flattened to what the run_render row stores.
 *
 * The function name and region come off the row, not out of the environment: a
 * template moved to another profile — or a region changed — between starting a
 * render and polling it would otherwise ask the wrong function about a render it
 * has never heard of, and the athlete would watch a progress bar that never moves.
 */
export async function fetchLambdaProgress(render: {
  region: AwsRegion;
  functionName: string;
  renderId: string;
  bucketName: string;
}): Promise<LambdaProgress> {
  const progress = await getRenderProgress(render);

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
