import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "./core/theme";
import { DEFAULT_PULSE } from "./templates/heartbeat/pulse";
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
      expect(TEMPLATE_COMPONENTS[template.id], template.id).toBeTypeOf(
        "function",
      );
      expect(TEMPLATE_DEFAULT_PROPS[template.id], template.id).toBeTypeOf(
        "object",
      );
    }
    expect(Object.keys(TEMPLATE_COMPONENTS).sort()).toEqual(
      [...TEMPLATE_IDS].sort(),
    );
  });

  it("keeps ids unique, and composition ids with them", () => {
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATE_IDS.length);
    const compositions = VIDEO_TEMPLATES.map(
      (template) => template.compositionId,
    );
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
    expect(() => getTemplate("race-recap" as never)).toThrow(
      /Unknown video template/,
    );
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

  it("does not make a template that draws only type pay for the map's iron", () => {
    for (const template of VIDEO_TEMPLATES) {
      if (template.usesMap) continue;
      const profile = getProfile(template);
      // No GPU work, no tile fetches: a cheap function, and Lambda bills by
      // GB-second. This is the axis the profiles exist to split.
      expect(profile.gl, template.id).toBeNull();
      expect(profile.memorySizeInMb, template.id).toBeLessThanOrEqual(1024);
    }
  });

  it("only lets a template be themed when the look is ours to re-tint", () => {
    for (const template of VIDEO_TEMPLATES) {
      if (!template.supportsTheme) continue;
      // The replay's plate is a Mapbox style; a cream video over a dark map is
      // not a theme, it is a different template.
      expect(template.usesMap, template.id).toBe(false);
      // …and a themed template is handed one, so Studio opens on a real look.
      expect(TEMPLATE_DEFAULT_PROPS[template.id].theme, template.id).toBe(
        DEFAULT_THEME,
      );
    }
  });

  it("only lets a template be pulsed when it has a heartbeat to keep time", () => {
    for (const template of VIDEO_TEMPLATES) {
      // The option is dropped in the route for anything that answers false, so
      // a template claiming it without reading it would store an answer that
      // changed nothing — and split two identical films across two renders.
      if (template.supportsPulse) {
        expect(template.hasAudio, template.id).toBe(true);
        expect(TEMPLATE_DEFAULT_PROPS[template.id].pulse, template.id).toBe(
          DEFAULT_PULSE,
        );
      } else {
        expect(
          TEMPLATE_DEFAULT_PROPS[template.id].pulse,
          template.id,
        ).toBeUndefined();
      }
    }
  });

  it("keeps the catalogue silent apart from the one film that isn't", () => {
    // `hasAudio` is what puts a mute button on the player. A template that
    // claimed it without an audio track would offer a control that can only
    // silence silence; one that has sound and doesn't claim it plays muted with
    // no way back. Both are worth failing a test over.
    const loud = VIDEO_TEMPLATES.filter((template) => template.hasAudio);
    expect(loud.map((template) => template.id)).toEqual(["heartbeat"]);
  });

  it("hands every template the key plate", () => {
    // The greenscreen option is catalogue-wide — it is a delivery format, not a
    // look, so there is no `supportsGreenscreen` for the compiler to ask about.
    // This is what catches a template added without one: its film would render
    // on black whatever the athlete chose, and they would key nothing.
    for (const template of VIDEO_TEMPLATES) {
      expect(TEMPLATE_DEFAULT_PROPS[template.id].greenscreen, template.id).toBe(
        false,
      );
    }
  });

  it("gives WebGL templates a software renderer and room to fetch tiles", () => {
    for (const template of VIDEO_TEMPLATES) {
      if (!template.usesMap) continue;
      const profile = getProfile(template);
      // Lambda has no GPU: a map template on the default backend renders black.
      expect(profile.gl, template.id).toBe("swangle");
      // Every frame waits on tiles, so the 30s delayRender default is not enough.
      expect(
        profile.delayRenderTimeoutInMilliseconds,
        template.id,
      ).toBeGreaterThan(30_000);
      // …and the frame budget has to fit inside the invocation that holds it.
      expect(
        profile.timeoutInSeconds * 1000,
        template.id,
      ).toBeGreaterThanOrEqual(profile.delayRenderTimeoutInMilliseconds);
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
    const names = VIDEO_TEMPLATES.map((template) =>
      serveUrlEnvVar(template.id),
    );
    expect(new Set(names).size).toBe(names.length);
  });
});
