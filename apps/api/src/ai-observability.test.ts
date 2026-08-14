// What PostHog actually receives for one coach turn.
//
// The events are asserted against a real `streamText` run rather than against
// hand-built callback payloads: the whole point of this module is that the AI
// SDK's lifecycle hooks fire when we think they do, with the numbers we think
// they carry, and a fake event object would agree with us whatever the SDK did.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { generateText, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";

process.env.BETTER_AUTH_SECRET ??= "test-secret-not-for-production";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5433/app";

interface Captured {
  event: "$ai_trace" | "$ai_generation" | "$ai_span";
  payload: Record<string, unknown>;
}

const captured: Captured[] = [];

vi.mock("./posthog.js", () => ({
  captureLlmTrace: (payload: Record<string, unknown>) =>
    captured.push({ event: "$ai_trace", payload }),
  captureLlmGeneration: (payload: Record<string, unknown>) =>
    captured.push({ event: "$ai_generation", payload }),
  captureLlmSpan: (payload: Record<string, unknown>) =>
    captured.push({ event: "$ai_span", payload }),
}));

const { observeTurn } = await import("./ai-observability.js");

const of = (event: Captured["event"]) =>
  captured.filter((one) => one.event === event).map((one) => one.payload);

const USAGE = {
  inputTokens: { total: 30, noCache: 28, cacheRead: 2, cacheWrite: 0 },
  outputTokens: { total: 12, text: 9, reasoning: 3 },
};

/** The head of every mock response. */
function opening(id: string): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "response-metadata", id, modelId: "mock", timestamp: new Date(0) },
  ];
}

/** A model that asks for the run's splits, reads them, and then answers. */
function toolThenAnswer() {
  const responses: LanguageModelV4StreamPart[][] = [
    [
      ...opening("res-0"),
      { type: "tool-input-start", id: "call-1", toolName: "getRunSplits" },
      { type: "tool-input-delta", id: "call-1", delta: '{"run_id":1}' },
      { type: "tool-input-end", id: "call-1" },
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "getRunSplits",
        input: '{"run_id":1}',
      },
      {
        type: "finish",
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: USAGE,
      },
    ],
    [
      ...opening("res-1"),
      { type: "text-start", id: "1" },
      { type: "text-delta", id: "1", delta: "Negative split. Good." },
      { type: "text-end", id: "1" },
      {
        type: "finish",
        finishReason: { unified: "stop", raw: "stop" },
        usage: USAGE,
      },
    ],
  ];

  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: responses[call++] }),
    }),
  });
}

/** A model that answers a word at a time, slowly enough to be interrupted. */
function slowAnswer() {
  const chunks: LanguageModelV4StreamPart[] = [
    ...opening("res-0"),
    { type: "text-start", id: "1" },
    ...Array.from({ length: 20 }, (_, i) => ({
      type: "text-delta" as const,
      id: "1",
      delta: `word${i} `,
    })),
    { type: "text-end", id: "1" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: USAGE,
    },
  ];

  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks, chunkDelayInMs: 20 }),
    }),
  });
}

/** The coach's tool set, in miniature — one tool, answering what it is told. */
function tools(splits: () => unknown) {
  return {
    getRunSplits: tool({
      description: "The run's splits.",
      inputSchema: z.object({ run_id: z.number() }),
      execute: async () => splits(),
    }),
  };
}

async function answer(model: MockLanguageModelV4, splits: () => unknown) {
  const turn = observeTurn({
    distinctId: "athlete-1",
    name: "coach turn",
    streamed: true,
    conversationId: "thread-1",
    replaySessionId: "replay-1",
    properties: { trigger: "submit-message" },
  });

  const result = streamText({
    model,
    system: "You are Vivace's running coach.",
    prompt: "How was that one?",
    tools: tools(splits),
    stopWhen: stepCountIs(3),
    ...turn.callbacks,
    onFinish: ({ text }) =>
      turn.end({ input: "How was that one?", output: text }),
    onError: ({ error }) => turn.end({ input: "How was that one?", error }),
  });

  await result.consumeStream();
  return turn;
}

describe("observeTurn", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it("files one trace, a generation per model call and a span per tool", async () => {
    const turn = await answer(toolThenAnswer(), () => ({ splits: [321, 318] }));

    expect(of("$ai_trace")).toHaveLength(1);
    // Two model calls: the one that asked for the splits, and the one that
    // wrote the answer. A single event for the turn would average them.
    expect(of("$ai_generation")).toHaveLength(2);
    expect(of("$ai_span")).toHaveLength(1);

    // The trace id is the only thing that groups them.
    for (const payload of captured.map((one) => one.payload)) {
      expect(payload.traceId).toBe(turn.traceId);
      expect(payload.conversationId).toBe("thread-1");
      expect(payload.replaySessionId).toBe("replay-1");
      expect(payload.properties).toEqual({ trigger: "submit-message" });
    }
  });

  it("hangs a tool call under the model call that asked for it", async () => {
    await answer(toolThenAnswer(), () => ({ splits: [321, 318] }));

    const [asked] = of("$ai_generation");
    const [span] = of("$ai_span");

    expect(span.spanName).toBe("getRunSplits");
    expect(span.parentId).toBe(asked.spanId);
    expect(span.input).toEqual({ run_id: 1 });
    expect(span.output).toEqual({ splits: [321, 318] });
    expect(span.error).toBeUndefined();
    expect(span.latencySeconds).toBeTypeOf("number");
  });

  it("counts a tool that answered `{ error }` as a failure", async () => {
    // stravaFailure in coach.ts: a dead upstream reaches the model as a
    // sentence, and would otherwise reach the dashboard as a healthy call.
    await answer(toolThenAnswer(), () => ({
      error: "Strava is unavailable right now (503).",
    }));

    const [span] = of("$ai_span");
    expect(span.error).toBe("Strava is unavailable right now (503).");
  });

  it("names a tool call the way PostHog's ingestion reads one", async () => {
    await answer(toolThenAnswer(), () => ({ splits: [] }));

    const [asked] = of("$ai_generation");
    // `{ function: { name } }`, not the SDK's `{ toolName }`: ingestion counts
    // tool calls by the first shape only, and would report none for this turn.
    expect(asked.output).toMatchObject([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            id: "call-1",
            function: { name: "getRunSplits", arguments: '{"run_id":1}' },
          },
        ],
      },
    ]);
  });

  it("carries the model's own numbers, not ours", async () => {
    await answer(toolThenAnswer(), () => ({ splits: [] }));

    const [, wrote] = of("$ai_generation");
    expect(wrote.modelId).toBe("mock");
    expect(wrote.inputTokens).toBe(30);
    expect(wrote.outputTokens).toBe(12);
    expect(wrote.reasoningTokens).toBe(3);
    expect(wrote.cacheReadTokens).toBe(2);
    expect(wrote.finishReason).toBe("stop");
    expect(wrote.completionId).toBe("res-1");
    expect(wrote.streamed).toBe(true);
    // The prompt this call was actually given, system message first — "why did
    // it answer that" is usually a question about the prompt, and by the second
    // call the prompt includes what the tool came back with.
    expect(
      (wrote.input as { role: string }[]).map((message) => message.role),
    ).toEqual(["system", "user", "assistant", "tool"]);
    expect(wrote.input).toMatchObject([
      { role: "system", content: "You are Vivace's running coach." },
      { role: "user", content: "How was that one?" },
      { role: "assistant" },
      { role: "tool" },
    ]);
    // What it was allowed to call, for the trace's tool tab.
    expect(wrote.tools).toHaveLength(1);
  });

  it("still files the turn when the athlete stops the answer", async () => {
    // The stop button, as the server sees it: the response stream is cancelled
    // and `streamText` never hears about it — no onFinish, no onAbort. Only
    // `onEnd` runs, which is why the route ends the turn from there.
    const turn = observeTurn({ distinctId: "athlete-1", name: "coach turn" });
    const result = streamText({
      model: slowAnswer(),
      prompt: "How was that one?",
      ...turn.callbacks,
      onFinish: ({ text }) => turn.end({ output: text }),
    });

    const response = result.toUIMessageStreamResponse({
      onEnd: ({ responseMessage }) =>
        turn.end({
          output: responseMessage,
          properties: { cut_short: true },
        }),
      onError: () => "err",
    });

    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(of("$ai_trace")).toHaveLength(1));

    expect(of("$ai_trace")[0].properties).toMatchObject({ cut_short: true });
  });

  it("times a failed call from its own start, not the turn's", async () => {
    const turn = observeTurn({ distinctId: "athlete-1", name: "coach turn" });
    // A tool that takes its time, and then a model call that dies. Timed from
    // the turn, the failure would claim the tool's seconds as its own.
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        if (call++ === 0) {
          return {
            stream: simulateReadableStream({
              chunks: [
                ...opening("res-0"),
                {
                  type: "tool-input-start",
                  id: "call-1",
                  toolName: "getRunSplits",
                },
                {
                  type: "tool-input-delta",
                  id: "call-1",
                  delta: '{"run_id":1}',
                },
                { type: "tool-input-end", id: "call-1" },
                {
                  type: "tool-call",
                  toolCallId: "call-1",
                  toolName: "getRunSplits",
                  input: '{"run_id":1}',
                },
                {
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool_calls" },
                  usage: USAGE,
                },
              ],
            }),
          };
        }
        throw new Error("503 upstream");
      },
    });

    const result = streamText({
      model,
      prompt: "How was that one?",
      tools: tools(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return { splits: [] };
      }),
      stopWhen: stepCountIs(3),
      maxRetries: 0,
      ...turn.callbacks,
      onError: ({ error }) => turn.end({ error }),
    });
    await result.consumeStream();

    const [, failed] = of("$ai_generation");
    expect(failed.error).toBeInstanceOf(Error);
    // The tool alone took a quarter of a second; the call that broke did not.
    expect(failed.latencySeconds).toBeLessThan(0.2);
    expect(of("$ai_trace")[0].latencySeconds).toBeGreaterThan(0.25);
  });

  it("files a failed model call as an error, not as silence", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("503 upstream");
      },
    });

    const turn = observeTurn({ distinctId: "athlete-1", name: "coach turn" });
    const result = streamText({
      model,
      prompt: "How was that one?",
      maxRetries: 0,
      ...turn.callbacks,
      onError: ({ error }) => turn.end({ error }),
    });
    await result.consumeStream();

    const [generation] = of("$ai_generation");
    const [trace] = of("$ai_trace");
    // The model that never answered still has to show in its own error rate.
    // Its id comes from the call that was attempted — there is no response to
    // read one off, which is the whole difficulty with a failed call.
    expect(generation.modelId).toBe("mock-model-id");
    expect(generation.error).toBeInstanceOf(Error);
    expect(trace.error).toBeInstanceOf(Error);
    expect(trace.spanName).toBe("coach turn");
  });

  it("traces a generateText call too — the debrief nobody is watching", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: "Steady. Keep the long run easy." }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: USAGE,
        warnings: [],
      }),
    });

    const turn = observeTurn({
      distinctId: "athlete-1",
      name: "post-run debrief",
      properties: { activity_id: 7 },
    });
    const { text } = await generateText({
      model,
      system: "You are Vivace's running coach.",
      prompt: "Write the debrief.",
      ...turn.callbacks,
    });
    turn.end({ input: "Write the debrief.", output: text });

    const [generation] = of("$ai_generation");
    const [trace] = of("$ai_trace");
    expect(generation.outputTokens).toBe(12);
    // Nothing streamed, so no first token to have waited for.
    expect(generation.streamed).toBeUndefined();
    expect(generation.timeToFirstTokenSeconds).toBeUndefined();
    // A webhook wrote this: no replay to link to, no conversation to sit in.
    expect(trace.spanName).toBe("post-run debrief");
    expect(trace.conversationId).toBeUndefined();
    expect(trace.replaySessionId).toBeUndefined();
  });

  it("ends a turn once, whichever callback gets there first", async () => {
    const turn = observeTurn({ distinctId: "athlete-1", name: "coach turn" });

    turn.end({ output: "Negative split. Good." });
    turn.end({ error: new Error("too late") });

    expect(of("$ai_trace")).toHaveLength(1);
    expect(of("$ai_trace")[0].error).toBeUndefined();
  });
});
