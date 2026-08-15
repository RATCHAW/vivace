// The one invariant an automatically posted debrief has to hold.
//
// A debrief is written by the webhook, not by the model: nothing called a tool,
// and nobody asked a question. Storing its card as a tool result puts a function
// call at the head of a thread with no user turn in front of it, and a provider
// rejects the athlete's *next* message with "function call turn must come
// immediately after a user turn or after a function response turn" — a failure
// that shows up one turn away from its cause.
//
// Carrying it in a `data-` part is what prevents that, because
// `convertToModelMessages` drops those.
import { describe, expect, it } from "vitest";
import { convertToModelMessages, type UIMessage } from "ai";
import { DEBRIEF_PART } from "./debrief.js";

const card = {
  card: "run-debrief",
  run_id: 19618376016,
  title: "Evening Run · Aug 5",
  stats: [{ label: "DISTANCE", value: "3.16 km" }],
};

const transcript = [
  {
    id: "m1",
    role: "assistant",
    parts: [
      { type: DEBRIEF_PART, data: card },
      { type: "text", text: "A textbook recovery shakeout." },
    ],
  },
  {
    id: "m2",
    role: "user",
    parts: [{ type: "text", text: "Read it split by split" }],
  },
] as unknown as UIMessage[];

describe("the automatic debrief", () => {
  it("is a data part, so the card never reaches the model as a tool call", async () => {
    expect(DEBRIEF_PART.startsWith("data-")).toBe(true);

    const messages = await convertToModelMessages(transcript);
    expect(messages).toHaveLength(2);
    // The assistant turn is the read and nothing else — no function call, and
    // therefore no function-response turn owed to the provider either.
    expect(messages[0]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "A textbook recovery shakeout." }],
    });
    expect(messages[1].role).toBe("user");
  });
});
