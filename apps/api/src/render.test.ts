import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE_ID, getTemplate } from "@repo/video";
import { renderPropsHash, resolveRenderTarget } from "./render.js";

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

    process.env.REMOTION_SERVE_URL = "https://s3/sites/vivace-abc123/index.html";
    expect(resolveRenderTarget(TEMPLATE)).not.toBeNull();
  });

  it("uses the shared function and site when nothing is overridden", () => {
    process.env.REMOTION_FUNCTION_NAME = "shared-fn";
    process.env.REMOTION_SERVE_URL = "https://s3/sites/vivace-abc123/index.html";

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
    process.env.REMOTION_SERVE_URL = "https://s3/sites/vivace-abc123/index.html";

    expect(resolveRenderTarget(TEMPLATE)?.functionName).toBe("map-fn-2048mb");
  });

  it("prefers the template's own bundle, so one can be canaried alone", () => {
    process.env.REMOTION_FUNCTION_NAME = "shared-fn";
    process.env.REMOTION_SERVE_URL = "https://s3/sites/vivace-abc123/index.html";
    process.env.REMOTION_SERVE_URL_RUN_VIDEO = "https://s3/sites/run-video-next/index.html";

    expect(resolveRenderTarget(TEMPLATE)?.serveUrl).toBe(
      "https://s3/sites/run-video-next/index.html",
    );
  });

  it("carries the region so a poll can find the render again", () => {
    process.env.REMOTION_AWS_REGION = "eu-central-1";
    process.env.REMOTION_FUNCTION_NAME = "shared-fn";
    process.env.REMOTION_SERVE_URL = "https://s3/sites/vivace-abc123/index.html";

    expect(resolveRenderTarget(TEMPLATE)?.region).toBe("eu-central-1");
  });
});

describe("renderPropsHash", () => {
  it("is stable for the same cut", () => {
    expect(renderPropsHash(TEMPLATE, { showAvatar: true })).toBe(
      renderPropsHash(TEMPLATE, { showAvatar: true }),
    );
  });

  it("separates the options that make a different video", () => {
    expect(renderPropsHash(TEMPLATE, { showAvatar: true })).not.toBe(
      renderPropsHash(TEMPLATE, { showAvatar: false }),
    );
  });

  it("separates templates, so one cut never serves another's MP4", () => {
    expect(renderPropsHash(TEMPLATE, { showAvatar: false })).not.toBe(
      renderPropsHash("other-template" as never, { showAvatar: false }),
    );
  });

  it("ignores where the render ran", () => {
    // Deliberate: including the serve URL would mark every finished video stale
    // the moment the bundle was redeployed, and offer athletes a re-render of a
    // file they already have.
    process.env.REMOTION_SERVE_URL = "https://s3/sites/vivace-abc123/index.html";
    const before = renderPropsHash(TEMPLATE, { showAvatar: false });
    process.env.REMOTION_SERVE_URL = "https://s3/sites/vivace-def456/index.html";
    expect(renderPropsHash(TEMPLATE, { showAvatar: false })).toBe(before);
  });
});
