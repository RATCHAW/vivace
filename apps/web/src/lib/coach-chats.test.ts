import { describe, expect, it, vi } from "vitest";
import type { Chat } from "@ai-sdk/react";
import type { ChatStatus, UIMessage } from "ai";
import {
  adoptTranscript,
  coachChatFor,
  disposeCoachChat,
  wroteAthleteContext,
} from "@/lib/coach-chats";

// The real logger would try to POST the batch; nothing here asserts on it.
vi.mock("@/lib/logger", () => ({
  trackError: vi.fn(),
}));

function message(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

/** An answer the coach gave, as its parts arrived. */
function answer(...parts: UIMessage["parts"]): UIMessage {
  return { id: "a1", role: "assistant", parts };
}

/** `setStatus` is protected — the transport is what drives it in production,
 *  and these tests have no transport to drive it with. */
function forceStatus(chat: Chat<UIMessage>, status: ChatStatus): void {
  (
    chat as unknown as {
      setStatus: (update: { status: ChatStatus }) => void;
    }
  ).setStatus({ status });
}

describe("coachChatFor", () => {
  it("keeps one chat per thread across mounts", () => {
    const first = coachChatFor("thread-a", [message("m1", "hello")]);
    const again = coachChatFor("thread-a", []);

    expect(again).toBe(first);
    // The second mount's snapshot must not reseed a conversation that already
    // exists — its transcript is the one being kept alive.
    expect(again.messages).toHaveLength(1);
  });

  it("keeps different threads apart", () => {
    const a = coachChatFor("thread-b", [message("m1", "hello")]);
    const b = coachChatFor("thread-c", []);

    expect(b).not.toBe(a);
    expect(a.messages).toHaveLength(1);
    expect(b.messages).toHaveLength(0);
  });

  it("seeds a new chat with the stored transcript", () => {
    const chat = coachChatFor("thread-d", [
      message("m1", "hello"),
      message("m2", "again"),
    ]);
    expect(chat.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("adoptTranscript", () => {
  it("adopts a server transcript that knows strictly more", () => {
    const chat = coachChatFor("thread-e", [message("m1", "hello")]);
    adoptTranscript(chat, [message("m1", "hello"), message("m2", "debrief")]);
    expect(chat.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("keeps the live transcript over a same-length snapshot", () => {
    const chat = coachChatFor("thread-f", [message("m1", "fresh")]);
    adoptTranscript(chat, [message("m1", "stale")]);

    const [part] = chat.messages[0].parts;
    expect(part.type === "text" && part.text).toBe("fresh");
  });

  it("keeps the live transcript over a shorter, staler snapshot", () => {
    const chat = coachChatFor("thread-g", [
      message("m1", "hello"),
      message("m2", "answer"),
    ]);
    adoptTranscript(chat, [message("m1", "hello")]);
    expect(chat.messages).toHaveLength(2);
  });

  it("never touches a conversation that is mid-answer", () => {
    const chat = coachChatFor("thread-h", [message("m1", "hello")]);
    forceStatus(chat, "streaming");

    adoptTranscript(chat, [message("m1", "hello"), message("m2", "late")]);
    expect(chat.messages).toHaveLength(1);
  });
});

describe("wroteAthleteContext", () => {
  it("sees the turn that stored a goal race", () => {
    expect(
      wroteAthleteContext(
        answer(
          {
            type: "tool-setAthleteContext",
            toolCallId: "call-1",
            state: "output-available",
            input: { race_name: "Casablanca Half" },
            output: { saved: true },
          },
          { type: "text", text: "Casablanca Half it is." },
        ),
      ),
    ).toBe(true);
  });

  it("ignores a call that failed — nothing was stored", () => {
    expect(
      wroteAthleteContext(
        answer({
          type: "tool-setAthleteContext",
          toolCallId: "call-1",
          state: "output-error",
          input: { race_name: "Casablanca Half" },
          errorText: "boom",
        }),
      ),
    ).toBe(false);
  });

  it("ignores a turn that only read the context", () => {
    expect(
      wroteAthleteContext(
        answer({
          type: "tool-getAthleteContext",
          toolCallId: "call-1",
          state: "output-available",
          input: {},
          output: { race_name: null },
        }),
      ),
    ).toBe(false);
  });

  it("ignores an answer that called nothing", () => {
    expect(
      wroteAthleteContext(answer({ type: "text", text: "Nice run." })),
    ).toBe(false);
  });
});

describe("disposeCoachChat", () => {
  it("forgets the conversation with its thread", () => {
    const before = coachChatFor("thread-i", [message("m1", "hello")]);
    disposeCoachChat("thread-i");

    const after = coachChatFor("thread-i", []);
    expect(after).not.toBe(before);
    expect(after.messages).toHaveLength(0);
  });

  it("ignores a thread it never held", () => {
    expect(() => disposeCoachChat("thread-never")).not.toThrow();
  });
});
