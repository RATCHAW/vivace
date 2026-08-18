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
import type { Run, RunPartner, RunStreams } from "./schemas.js";

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
  /** Cut the film's canvas as a chroma key plate, so the athlete can drop their
   *  own footage in behind it. Every template honours this one. */
  greenscreen: boolean;
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
  /**
   * Which run is drawn beside this one, on a template that draws two.
   *
   * Not an option — nobody chose it — but it is the other half of what the film
   * *is*, so it belongs in the identity: if a different athlete's run ends up
   * being the partner, the stored MP4 is of two other people and must not be
   * handed back. Null for every template that draws one runner, which is what
   * leaves every hash written before this existed untouched.
   */
  partnerActivityId: number | null = null,
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
    // Same trick, and the same reason: a film nobody asked to key hashes
    // exactly as it did before the option existed.
    ...(options.greenscreen ? { greenscreen: true } : {}),
    ...(partnerActivityId == null ? {} : { partner: partnerActivityId }),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/** Everything a composition is handed. One envelope rather than a growing list
 *  of positional arguments — every template takes what it reads from it and
 *  ignores the rest, which is the same contract the browser's <Player> has. */
export interface RenderInput {
  run: Run;
  streams: RunStreams;
  /** The athlete's Strava picture URL when the avatar option is on, else "" —
   *  which is also what an athlete who never set one gets. */
  avatarUrl: string;
  /** Whether the option was on at all. Read separately from `avatarUrl` because
   *  the partner's picture rides the same switch, and an athlete with no picture
   *  of their own must not switch it off for the person beside them. */
  showAvatar?: boolean;
  /** What to call the athlete on their own bar in a two-runner film. */
  athleteName: string;
  /** The look to cut it in; a template that isn't themed ignores it. */
  theme?: ThemeName;
  /** Cut it on the chroma key plate. Every template honours this one. */
  greenscreen?: boolean;
  /** The other runner, on a template that draws two. Null everywhere else. */
  partner?: RunPartner | null;
}

/** Kicks off a Lambda render; the MP4 lands in Remotion's S3 bucket. */
export async function startLambdaRender(
  target: RenderTarget,
  {
    run,
    streams,
    avatarUrl,
    showAvatar = avatarUrl !== "",
    athleteName,
    theme = DEFAULT_THEME,
    greenscreen = false,
    partner = null,
  }: RenderInput,
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
      greenscreen,
      athleteName,
      // The props contract is camelCase — `VideoPartner` in @repo/video — and
      // the API's own is snake_case, so the crossing happens here rather than
      // in a composition that would then have to know about both.
      partner:
        template.needsPartner && partner
          ? {
              name: partner.name,
              activity: partner.activity,
              streams: partner.streams,
              // A template that ignores the avatar option must not be handed a
              // picture, for the same reason the option is dropped from the
              // hash: two identical films would otherwise differ.
              avatarUrl:
                template.supportsAvatar && showAvatar ? partner.avatar_url : "",
            }
          : null,
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
