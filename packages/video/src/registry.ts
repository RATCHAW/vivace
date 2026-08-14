/**
 * The template catalogue — the one place a video is declared.
 *
 * This module is deliberately React-free and dependency-free: apps/api imports
 * it to decide which composition to render and on which Lambda, and it must not
 * drag the compositions (or React, or Mapbox) into the server. The components
 * themselves are wired up in `Root.tsx`, and a test fails if the two drift.
 *
 * Adding a template is: an entry here, a component in `templates/`, a line in
 * `Root.tsx`. Nothing in apps/api changes.
 */

/**
 * The iron a template needs on Lambda.
 *
 * This — not the serve URL — is the axis worth splitting. A site bundle is one
 * upload that can hold any number of compositions, but memory is billed per
 * GB-second, so a template that only draws type shouldn't pay for the one that
 * rasterises map tiles through software OpenGL.
 */
export interface RenderProfile {
  /** Lambda memory. Remotion's floor for WebGL work is 2GB. */
  memorySizeInMb: number;
  /** Hard ceiling on one Lambda invocation. */
  timeoutInSeconds: number;
  /**
   * Chromium's OpenGL backend. `"swangle"` is Lambda's software renderer, which
   * anything using WebGL needs; null leaves Remotion's default in place.
   */
  gl: "swangle" | null;
  /**
   * How long a single frame may hold `delayRender` open. Frames that wait on the
   * network — map tiles, an avatar from a CDN — need far more than the 30s
   * default; frames that only lay out type need far less, and a low ceiling is
   * what turns a hung fetch into a failed render instead of a full-price one.
   */
  delayRenderTimeoutInMilliseconds: number;
}

export const RENDER_PROFILES = {
  /** WebGL map tiles over the network: the expensive one. */
  map: {
    memorySizeInMb: 2048,
    timeoutInSeconds: 240,
    gl: "swangle",
    delayRenderTimeoutInMilliseconds: 120_000,
  },
  /**
   * Type, shapes and images only — no GPU, no tile fetches. Nothing uses this
   * yet; it exists so the first template that doesn't need a map can declare it
   * and get its own cheaper function without touching the API.
   */
  light: {
    memorySizeInMb: 1024,
    timeoutInSeconds: 120,
    gl: null,
    delayRenderTimeoutInMilliseconds: 30_000,
  },
} as const satisfies Record<string, RenderProfile>;

export type RenderProfileName = keyof typeof RENDER_PROFILES;

export interface VideoTemplate {
  /** Stable id. Stored on every render row and sent by the browser, so renaming
   *  one orphans the videos made with it — add a new template instead. */
  id: string;
  /**
   * The `<Composition>` id inside the site bundle. Usually the same string as
   * `id`, but they are separate on purpose: a template can be promoted to its
   * own bundle (see `serveUrlEnvVar`) without its user-facing id changing.
   */
  compositionId: string;
  /** Shown in the picker. */
  label: string;
  description: string;
  profile: RenderProfileName;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  /** Draws a Mapbox plate, so the render needs the server's Mapbox token. */
  usesMap: boolean;
  /** Honours the `show_avatar` option. When false the API skips the Strava
   *  profile fetch entirely rather than passing a picture nothing draws. */
  supportsAvatar: boolean;
  /** Honours the `theme` option. False for a template whose look is not ours to
   *  re-tint — the replay's plate is a Mapbox style, and a cream video over a
   *  dark map is not a theme, it is a different template. */
  supportsTheme: boolean;
}

const FPS = 30;

export const VIDEO_TEMPLATES = [
  {
    id: "run-video",
    compositionId: "run-video",
    label: "Route replay",
    description:
      "The route drawing under live metrics, camera following the runner. One shot, 9:16.",
    profile: "map",
    width: 1080,
    height: 1920,
    fps: FPS,
    durationInFrames: 20 * FPS,
    usesMap: true,
    supportsAvatar: true,
    supportsTheme: false,
  },
  {
    id: "split-rush",
    compositionId: "split-rush",
    label: "Split rush",
    description:
      "Every kilometre as a bar, the fastest one isolated, one verdict to close. " +
      "No GPS anywhere in it — a treadmill run gets the same film as a park one.",
    profile: "light",
    width: 1080,
    height: 1920,
    fps: FPS,
    // Typical, not fixed: the real length is `estimateDurationInFrames`, which
    // counts the splits. This is what Studio opens on and what a bundle without
    // `calculateMetadata` would render.
    durationInFrames: 12 * FPS,
    usesMap: false,
    supportsAvatar: false,
    supportsTheme: true,
  },
  {
    id: "living-poster",
    compositionId: "living-poster",
    label: "Route poster",
    description:
      "The route drawn on a bare plate, north up, then held still. The last two " +
      "and a half seconds are a frame you could print.",
    profile: "light",
    width: 1080,
    height: 1920,
    fps: FPS,
    durationInFrames: 10 * FPS,
    usesMap: false,
    supportsAvatar: false,
    supportsTheme: true,
  },
  {
    id: "minimal-numbers",
    compositionId: "minimal-numbers",
    label: "Minimal numbers",
    description:
      "One number at a time, filling the screen. Needs nothing but a distance " +
      "and a time, so it renders for every run there is.",
    profile: "light",
    width: 1080,
    height: 1920,
    fps: FPS,
    durationInFrames: 9 * FPS,
    usesMap: false,
    supportsAvatar: false,
    supportsTheme: true,
  },
] as const satisfies readonly VideoTemplate[];

export type TemplateId = (typeof VIDEO_TEMPLATES)[number]["id"];

/** Non-empty by construction, which is what `z.enum` wants on the API side. */
export const TEMPLATE_IDS = VIDEO_TEMPLATES.map((template) => template.id) as [
  TemplateId,
  ...TemplateId[],
];

/** What a request that names no template gets — the first entry, so the
 *  catalogue's order is also its precedence. */
export const DEFAULT_TEMPLATE_ID: TemplateId = VIDEO_TEMPLATES[0].id;

export function isTemplateId(value: string): value is TemplateId {
  return TEMPLATE_IDS.includes(value as TemplateId);
}

export function getTemplate(id: TemplateId): VideoTemplate {
  const template = VIDEO_TEMPLATES.find((entry) => entry.id === id);
  // Unreachable through `TemplateId`, but the catalogue is also read from
  // stored rows, where a removed template would otherwise crash a page render.
  if (!template) throw new Error(`Unknown video template: ${id}`);
  return template;
}

export function getProfile(template: VideoTemplate): RenderProfile {
  return RENDER_PROFILES[template.profile];
}

/* ---- Environment ---------------------------------------------------------
 *
 * The deploy script writes these names and the API reads them, so they are
 * derived in one place rather than spelled twice.
 */

const envSuffix = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/**
 * Where a *specific* template's bundle lives, overriding the shared site.
 *
 * Unset is the normal state: every template renders from `REMOTION_SERVE_URL`,
 * one bundle holding every composition. Set it to canary a template on a new
 * bundle, or to point one at a site of its own once its dependencies are heavy
 * enough that the other templates shouldn't pay to download them on a cold
 * start.
 */
export function serveUrlEnvVar(id: string): string {
  return `REMOTION_SERVE_URL_${envSuffix(id)}`;
}

/** The function for a profile, overriding the shared `REMOTION_FUNCTION_NAME`.
 *  This is what makes the cheap profile actually cheap. */
export function functionNameEnvVar(profile: RenderProfileName): string {
  return `REMOTION_FUNCTION_NAME_${envSuffix(profile)}`;
}

/** Every profile a deployed site has to support, in catalogue order. */
export function profilesInUse(): RenderProfileName[] {
  const seen: RenderProfileName[] = [];
  for (const template of VIDEO_TEMPLATES) {
    if (!seen.includes(template.profile)) seen.push(template.profile);
  }
  return seen;
}
