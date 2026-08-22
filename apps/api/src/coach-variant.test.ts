// Which model and which prompt answer a turn, when a PostHog flag is what
// decides it.
//
// The flag is the only thing stubbed. Everything under test is the part that
// has to survive a payload someone typed into a browser textarea: a variant is
// edited with no review and no deploy, so the rules are that a bad one changes
// nothing and never passes silently.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureVariant } from "./posthog.js";

/** What PostHog says the athlete's variant is, for the test that set it. */
let evaluated: FeatureVariant | null = null;

vi.mock("./posthog.js", () => ({
  getFeatureVariantFor: async () => evaluated,
}));

const {
  COACH_VARIANT_FLAG,
  DEFAULT_PROMPT_VERSION,
  PROMPT_VERSIONS,
  coachSystemPrompt,
  getCoachConfig,
  resolveCoachVariant,
} = await import("./coach.js");

/** Collects what the resolver refused, the way the chat route logs it. */
function refusals() {
  const seen: { source: string; value: unknown }[] = [];
  return {
    seen,
    onInvalid: (source: "flag" | "env", value: unknown) => {
      seen.push({ source, value });
    },
  };
}

beforeEach(() => {
  evaluated = null;
  vi.unstubAllEnvs();
  // A fresh clone names neither, and that is the pairing everything falls back
  // to. Stubbed rather than assumed, so a developer's own .env can't decide it.
  vi.stubEnv("COACH_MODEL", "");
  vi.stubEnv("COACH_PROMPT", "");
});

describe("resolveCoachVariant", () => {
  it("is the shipped pairing when there is no flag", async () => {
    const { seen, onInvalid } = refusals();

    // PostHog off, unreachable, flag deleted, athlete outside the rollout: one
    // answer for all four, and it is the behaviour the app shipped with.
    await expect(resolveCoachVariant("athlete-1", onInvalid)).resolves.toEqual({
      prompt: DEFAULT_PROMPT_VERSION,
    });
    expect(seen).toEqual([]);
  });

  it("takes the model and the prompt from the variant's payload", async () => {
    evaluated = {
      value: "sonnet-terse",
      payload: { model: "anthropic/claude-sonnet-5", prompt: "v2-terse" },
    };
    const { seen, onInvalid } = refusals();

    await expect(resolveCoachVariant("athlete-1", onInvalid)).resolves.toEqual({
      variant: "sonnet-terse",
      modelId: "anthropic/claude-sonnet-5",
      prompt: "v2-terse",
    });
    expect(seen).toEqual([]);
  });

  it("keeps the arm's name even when the payload only names one axis", async () => {
    evaluated = {
      value: "terse-on-the-default-model",
      payload: { prompt: "v2-terse" },
    };

    await expect(
      resolveCoachVariant("athlete-1", refusals().onInvalid),
    ).resolves.toEqual({
      variant: "terse-on-the-default-model",
      modelId: undefined,
      prompt: "v2-terse",
    });
  });

  it("treats an empty payload as the shipped pairing, not as a mistake", async () => {
    // A flag someone created and hasn't filled in yet. Nothing to refuse.
    evaluated = { value: "control", payload: null };
    const { seen, onInvalid } = refusals();

    await expect(resolveCoachVariant("athlete-1", onInvalid)).resolves.toEqual({
      variant: "control",
      prompt: DEFAULT_PROMPT_VERSION,
    });
    expect(seen).toEqual([]);
  });

  it("carries a payload-only flag's config with no arm to attribute", async () => {
    // PostHog's remote config: a boolean flag that exists to hold a payload.
    // There is no variant key, so there is nothing for an experiment to split
    // on — but the model still changes for everyone, with no deploy.
    evaluated = { value: true, payload: { model: "deepseek/deepseek-v4-pro" } };

    await expect(
      resolveCoachVariant("athlete-1", refusals().onInvalid),
    ).resolves.toEqual({
      variant: undefined,
      modelId: "deepseek/deepseek-v4-pro",
      prompt: DEFAULT_PROMPT_VERSION,
    });
  });

  it("refuses a model id that doesn't pin a vendor, out loud", async () => {
    // A bare id hands the choice of vendor back to the gateway, which is the
    // thing writing `vendor/model` everywhere exists to prevent.
    evaluated = { value: "typo", payload: { model: "claude-sonnet-5" } };
    const { seen, onInvalid } = refusals();

    await expect(resolveCoachVariant("athlete-1", onInvalid)).resolves.toEqual({
      variant: "typo",
      prompt: DEFAULT_PROMPT_VERSION,
    });
    expect(seen).toEqual([
      { source: "flag", value: { model: "claude-sonnet-5" } },
    ]);
  });

  it("refuses a prompt version the catalogue has never heard of", async () => {
    // The whole payload falls back, not just the bad half: the pair is the unit
    // that varies, and half a variant is a combination nobody meant to ship.
    evaluated = {
      value: "v3",
      payload: { model: "anthropic/claude-sonnet-5", prompt: "v3-friendly" },
    };
    const { seen, onInvalid } = refusals();

    await expect(resolveCoachVariant("athlete-1", onInvalid)).resolves.toEqual({
      variant: "v3",
      prompt: DEFAULT_PROMPT_VERSION,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].source).toBe("flag");
  });

  it("falls back to COACH_PROMPT when no flag decides it", async () => {
    vi.stubEnv("COACH_PROMPT", "v2-terse");

    await expect(
      resolveCoachVariant("athlete-1", refusals().onInvalid),
    ).resolves.toEqual({ prompt: "v2-terse" });
  });

  it("lets a variant's prompt beat the env var, which is the point", async () => {
    vi.stubEnv("COACH_PROMPT", "v2-terse");
    evaluated = { value: "control", payload: { prompt: "v1" } };

    await expect(
      resolveCoachVariant("athlete-1", refusals().onInvalid),
    ).resolves.toEqual({
      variant: "control",
      modelId: undefined,
      prompt: "v1",
    });
  });

  it("refuses a COACH_PROMPT that names nothing, out loud", async () => {
    vi.stubEnv("COACH_PROMPT", "terse");
    const { seen, onInvalid } = refusals();

    await expect(resolveCoachVariant("athlete-1", onInvalid)).resolves.toEqual({
      prompt: DEFAULT_PROMPT_VERSION,
    });
    expect(seen).toEqual([{ source: "env", value: "terse" }]);
  });

  it("names one flag, because the pair is what varies", () => {
    // A flag per axis would let a turn land on a prompt tuned for one model in
    // front of another.
    expect(COACH_VARIANT_FLAG).toBe("coach-model");
  });
});

describe("getCoachConfig", () => {
  beforeEach(() => {
    vi.stubEnv("LLM_GATEWAY_API_KEY", "gateway-key");
  });

  it("is null without an API key, whatever the variant says", () => {
    vi.stubEnv("LLM_GATEWAY_API_KEY", "");
    expect(getCoachConfig("anthropic/claude-sonnet-5")).toBeNull();
  });

  it("ships DeepSeek when nothing overrides it", () => {
    expect(getCoachConfig()?.modelId).toBe("deepseek/deepseek-v4-flash");
  });

  it("lets a variant's model beat COACH_MODEL", () => {
    // The deploy names one; the flag is how it changes without a deploy.
    vi.stubEnv("COACH_MODEL", "deepseek/deepseek-v4-pro");

    expect(getCoachConfig()?.modelId).toBe("deepseek/deepseek-v4-pro");
    expect(getCoachConfig("anthropic/claude-sonnet-5")?.modelId).toBe(
      "anthropic/claude-sonnet-5",
    );
  });
});

describe("coachSystemPrompt", () => {
  it("writes the shipped prompt when no version is named", () => {
    const prompt = coachSystemPrompt("2026-08-18", 6);

    expect(prompt).toContain("You are Vivace's running coach.");
    expect(prompt).toContain("Today is 2026-08-18.");
    expect(prompt).toContain("the last 6 weeks");
    expect(prompt).not.toContain("two sentences, three at the very most");
  });

  it("writes a variant's prompt when one is", () => {
    const terse = coachSystemPrompt("2026-08-18", 6, { prompt: "v2-terse" });

    // A variant is the same coach with different rules, not a different app —
    // it still has the tools and still knows what day it is.
    expect(terse).toContain("You are Vivace's running coach.");
    expect(terse).toContain("Today is 2026-08-18.");
    expect(terse).toContain("two sentences, three at the very most");
  });

  it("still folds in the attached runs, whichever prompt answers", () => {
    for (const version of PROMPT_VERSIONS) {
      const prompt = coachSystemPrompt("2026-08-18", 6, {
        prompt: version,
        attached: [{ id: 42, name: "Long run", date: "2026-08-16" }],
      });
      expect(prompt).toContain("Strava activity id 42");
    }
  });

  it("asks every version for its form in the athlete's language", () => {
    // The variant and the language reach the prompt through the same options,
    // and they are orthogonal: a French athlete in the terse arm gets both.
    for (const version of PROMPT_VERSIONS) {
      const prompt = coachSystemPrompt("2026-08-18", 6, {
        prompt: version,
        language: "fr",
      });
      expect(prompt).toContain("reading the app in French");
    }
  });

  it("every version in the catalogue renders a prompt", () => {
    // The payload schema accepts exactly these, so a key without a prompt
    // behind it would hand the model an empty system message.
    for (const version of PROMPT_VERSIONS) {
      expect(
        coachSystemPrompt("2026-08-18", 6, { prompt: version }).length,
      ).toBeGreaterThan(200);
    }
    expect(PROMPT_VERSIONS).toContain(DEFAULT_PROMPT_VERSION);
  });
});
