import { describe, expect, it } from "vitest";
import { TEMPLATE_COMPONENTS, TEMPLATE_DEFAULT_PROPS } from "./Root";
import {
  DEFAULT_TEMPLATE_ID,
  functionNameEnvVar,
  getProfile,
  getTemplate,
  isTemplateId,
  profilesInUse,
  RENDER_PROFILES,
  serveUrlEnvVar,
  TEMPLATE_IDS,
  VIDEO_TEMPLATES,
} from "./registry";

describe("the catalogue", () => {
  it("gives every template a component and default props", () => {
    // The pair that can't be checked by the compiler: `registry.ts` is
    // React-free so apps/api can import it, which means nothing there refers to
    // a component. This is the assertion that keeps the halves together — a
    // template with no entry in Root.tsx would deploy a site whose composition
    // renders nothing, and fail at render time on Lambda rather than here.
    for (const template of VIDEO_TEMPLATES) {
      expect(TEMPLATE_COMPONENTS[template.id], template.id).toBeTypeOf("function");
      expect(TEMPLATE_DEFAULT_PROPS[template.id], template.id).toBeTypeOf("object");
    }
    expect(Object.keys(TEMPLATE_COMPONENTS).sort()).toEqual([...TEMPLATE_IDS].sort());
  });

  it("keeps ids unique, and composition ids with them", () => {
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATE_IDS.length);
    const compositions = VIDEO_TEMPLATES.map((template) => template.compositionId);
    // Two templates pointing at one composition would render the same film for
    // both, and the second would silently be the first.
    expect(new Set(compositions).size).toBe(compositions.length);
  });

  it("describes a playable film for each template", () => {
    for (const template of VIDEO_TEMPLATES) {
      expect(template.durationInFrames, template.id).toBeGreaterThan(0);
      expect(template.fps, template.id).toBeGreaterThan(0);
      expect(template.width, template.id).toBeGreaterThan(0);
      expect(template.height, template.id).toBeGreaterThan(0);
      expect(RENDER_PROFILES[template.profile], template.id).toBeDefined();
    }
  });

  it("defaults to a template that exists", () => {
    expect(isTemplateId(DEFAULT_TEMPLATE_ID)).toBe(true);
    expect(getTemplate(DEFAULT_TEMPLATE_ID).id).toBe(DEFAULT_TEMPLATE_ID);
  });

  it("rejects an unknown id rather than rendering something else", () => {
    expect(isTemplateId("race-recap")).toBe(false);
    expect(() => getTemplate("race-recap" as never)).toThrow(/Unknown video template/);
  });

  it("lists each profile in use once", () => {
    const profiles = profilesInUse();
    expect(new Set(profiles).size).toBe(profiles.length);
    expect(profiles).toEqual(
      expect.arrayContaining([getTemplate(DEFAULT_TEMPLATE_ID).profile]),
    );
    // A profile nothing uses is a function the deploy script must not create.
    for (const profile of profiles) {
      expect(VIDEO_TEMPLATES.some((t) => t.profile === profile)).toBe(true);
    }
  });

  it("gives WebGL templates a software renderer and room to fetch tiles", () => {
    for (const template of VIDEO_TEMPLATES) {
      if (!template.usesMap) continue;
      const profile = getProfile(template);
      // Lambda has no GPU: a map template on the default backend renders black.
      expect(profile.gl, template.id).toBe("swangle");
      // Every frame waits on tiles, so the 30s delayRender default is not enough.
      expect(profile.delayRenderTimeoutInMilliseconds, template.id).toBeGreaterThan(
        30_000,
      );
      // …and the frame budget has to fit inside the invocation that holds it.
      expect(profile.timeoutInSeconds * 1000, template.id).toBeGreaterThanOrEqual(
        profile.delayRenderTimeoutInMilliseconds,
      );
    }
  });
});

describe("environment variable names", () => {
  it("derives one name per template and per profile", () => {
    expect(serveUrlEnvVar("run-video")).toBe("REMOTION_SERVE_URL_RUN_VIDEO");
    expect(functionNameEnvVar("map")).toBe("REMOTION_FUNCTION_NAME_MAP");
    expect(functionNameEnvVar("light")).toBe("REMOTION_FUNCTION_NAME_LIGHT");
  });

  it("produces a legal variable name for every template", () => {
    // The deploy script prints these and a human pastes them into a .env, so a
    // template id with a character a shell won't accept has to survive the trip.
    for (const template of VIDEO_TEMPLATES) {
      expect(serveUrlEnvVar(template.id)).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it("does not collide two templates onto one variable", () => {
    const names = VIDEO_TEMPLATES.map((template) => serveUrlEnvVar(template.id));
    expect(new Set(names).size).toBe(names.length);
  });
});
