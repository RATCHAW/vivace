import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE_ID, getTemplate } from "@repo/video";
import {
  renderPropsHash,
  resolveRenderTarget,
  type RenderOptions,
} from "./render.js";

const TEMPLATE = DEFAULT_TEMPLATE_ID;
const PROFILE = getTemplate(TEMPLATE).profile.toUpperCase();

const VARS = [
  "REMOTION_AWS_REGION",
  "REMOTION_FUNCTION_NAME",
  `REMOTION_FUNCTION_NAME_${PROFILE}`,
  "REMOTION_SERVE_URL",
  "REMOTION_SERVE_URL_RUN_VIDEO",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(VARS.map((name) => [name, process.env[name]]));
  for (const name of VARS) delete process.env[name];
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("resolveRenderTarget", () => {
  it("is null until both halves are configured", () => {
    expect(resolveRenderTarget(TEMPLATE)).toBeNull();

    process.env.REMOTION_FUNCTION_NAME = "shared-fn";
    // A function with no bundle to render is still not a render.
    expect(resolveRenderTarget(TEMPLATE)).toBeNull();

    process.env.REMOTION_SERVE_URL =
      "https://s3/sites/vivace-abc123/index.html";
    expect(resolveRenderTarget(TEMPLATE)).not.toBeNull();
  });

  it("uses the shared function and site when nothing is overridden", () => {
    process.env.REMOTION_FUNCTION_NAME = "shared-fn";
    process.env.REMOTION_SERVE_URL =
      "https://s3/sites/vivace-abc123/index.html";

    const target = resolveRenderTarget(TEMPLATE);
    expect(target).toMatchObject({
      functionName: "shared-fn",
      serveUrl: "https://s3/sites/vivace-abc123/index.html",
      // The normal state: one bundle for every template. Adding a template must
      // not require a deployment of its own.
      region: "us-east-1",
    });
    expect(target?.template.id).toBe(TEMPLATE);
  });

  it("prefers the profile's own function — the point of the split", () => {
    process.env.REMOTION_FUNCTION_NAME = "shared-fn";
    process.env[`REMOTION_FUNCTION_NAME_${PROFILE}`] = "map-fn-2048mb";
    process.env.REMOTION_SERVE_URL =
      "https://s3/sites/vivace-abc123/index.html";

    expect(resolveRenderTarget(TEMPLATE)?.functionName).toBe("map-fn-2048mb");
  });

  it("prefers the template's own bundle, so one can be canaried alone", () => {
    process.env.REMOTION_FUNCTION_NAME = "shared-fn";
    process.env.REMOTION_SERVE_URL =
      "https://s3/sites/vivace-abc123/index.html";
    process.env.REMOTION_SERVE_URL_RUN_VIDEO =
      "https://s3/sites/run-video-next/index.html";

    expect(resolveRenderTarget(TEMPLATE)?.serveUrl).toBe(
      "https://s3/sites/run-video-next/index.html",
    );
  });

  it("carries the region so a poll can find the render again", () => {
    process.env.REMOTION_AWS_REGION = "eu-central-1";
    process.env.REMOTION_FUNCTION_NAME = "shared-fn";
    process.env.REMOTION_SERVE_URL =
      "https://s3/sites/vivace-abc123/index.html";

    expect(resolveRenderTarget(TEMPLATE)?.region).toBe("eu-central-1");
  });
});

describe("renderPropsHash", () => {
  /** The cut every assertion starts from: the answers a render that was never
   *  configured is made with. Spelled once, so a new option is one edit here
   *  rather than one per assertion — and so the ones below name only what they
   *  are actually about. */
  const cut = (options: Partial<RenderOptions> = {}): RenderOptions => ({
    showAvatar: false,
    theme: "charcoal",
    greenscreen: false,
    ...options,
  });

  it("is stable for the same cut", () => {
    expect(renderPropsHash(TEMPLATE, cut({ showAvatar: true }))).toBe(
      renderPropsHash(TEMPLATE, cut({ showAvatar: true })),
    );
  });

  it("separates the options that make a different video", () => {
    expect(renderPropsHash(TEMPLATE, cut({ showAvatar: true }))).not.toBe(
      renderPropsHash(TEMPLATE, cut()),
    );
  });

  it("separates templates, so one cut never serves another's MP4", () => {
    expect(renderPropsHash(TEMPLATE, cut())).not.toBe(
      renderPropsHash("other-template" as never, cut()),
    );
  });

  it("separates the look, but leaves the default one out of the hash", () => {
    // A theme other than the default is a different film, and the browser has
    // to be offered a re-render for it.
    expect(renderPropsHash(TEMPLATE, cut({ theme: "cream" }))).not.toBe(
      renderPropsHash(TEMPLATE, cut()),
    );
    // …and the default one hashes to what it hashed to before themes existed,
    // so adding the option marked no athlete's finished video stale.
    expect(renderPropsHash(TEMPLATE, cut())).toBe(
      createHash("sha256")
        .update(JSON.stringify({ template: TEMPLATE, show_avatar: false }))
        .digest("hex")
        .slice(0, 32),
    );
  });

  it("separates who else is in the film, and leaves a solo one out of the hash", () => {
    // Two different partners is two different films, whatever else matched.
    expect(renderPropsHash("duo-replay", cut(), 111)).not.toBe(
      renderPropsHash("duo-replay", cut(), 222),
    );
    // …and a template that draws one runner hashes exactly as it did before a
    // second one was possible, so no finished video was marked stale.
    expect(renderPropsHash(TEMPLATE, cut())).toBe(
      renderPropsHash(TEMPLATE, cut(), null),
    );
  });

  it("separates the key plate, and leaves a film nobody keys where it was", () => {
    // A greenscreen cut is a different file from the same run on black.
    expect(renderPropsHash(TEMPLATE, cut({ greenscreen: true }))).not.toBe(
      renderPropsHash(TEMPLATE, cut()),
    );
    // The option off hashes to what it hashed to before the option existed —
    // the same promise the default theme keeps.
    expect(renderPropsHash(TEMPLATE, cut())).toBe(
      createHash("sha256")
        .update(JSON.stringify({ template: TEMPLATE, show_avatar: false }))
        .digest("hex")
        .slice(0, 32),
    );
    // …and it composes with the look rather than replacing it: cream keyed and
    // cream on paper are two films.
    expect(
      renderPropsHash(TEMPLATE, cut({ theme: "cream", greenscreen: true })),
    ).not.toBe(renderPropsHash(TEMPLATE, cut({ theme: "cream" })));
  });

  it("ignores where the render ran", () => {
    // Deliberate: including the serve URL would mark every finished video stale
    // the moment the bundle was redeployed, and offer athletes a re-render of a
    // file they already have.
    process.env.REMOTION_SERVE_URL =
      "https://s3/sites/vivace-abc123/index.html";
    const before = renderPropsHash(TEMPLATE, cut());
    process.env.REMOTION_SERVE_URL =
      "https://s3/sites/vivace-def456/index.html";
    expect(renderPropsHash(TEMPLATE, cut())).toBe(before);
  });
});
