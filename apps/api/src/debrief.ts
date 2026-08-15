// The post-run debrief: the coach reading a run before the athlete asks.
//
// Triggered by a Strava webhook (see webhook.ts), which means nobody is waiting
// on a response — so this is allowed to take its time, and every failure has to
// be logged rather than surfaced.
//
// What lands in the thread is exactly what the athlete would have got by
// asking: the same `getRunDebrief` card, followed by two sentences of read. The
// card is built from our own data and is always correct; the sentences need a
// model, and their absence is not a reason to withhold the card.
import { generateText } from "ai";
import { createIdGenerator, type UIMessage } from "ai";
import { logger } from "./logger.js";
import { captureUserEvent } from "./posthog.js";
import { observeTurn } from "./ai-observability.js";
import {
  buildRunDebriefCard,
  getCoachConfig,
  coachSystemPrompt,
} from "./coach.js";
import {
  findOrCreateThread,
  recordDebrief,
  saveMessage,
} from "./chat-store.js";
import { fetchRuns } from "./strava.js";
import { todayLocal } from "./briefing.js";
import { localDate } from "./training.js";

/** Every automatic debrief lands here, rather than interrupting a conversation. */
export const DEBRIEF_THREAD_TITLE = "Post-run debriefs";

/**
 * The message part the debrief card travels in.
 *
 * A `data-` prefix is what makes the AI SDK treat it as UI rather than as
 * something the model said — apps/web keys its card renderer off this exact
 * string, so the two have to move together.
 */
export const DEBRIEF_PART = "data-runDebrief";

const messageId = createIdGenerator({ prefix: "msg", size: 16 });

/**
 * What the coach says under the card when there is no model configured.
 *
 * Deliberately factual: the card's own comparison line is measured, so the
 * fallback restates the shape of the run and stops. Better a short true
 * sentence than a missing message.
 */
function withoutModel(card: { title: string; line: string }): string {
  return `${card.title} is in. ${card.line} Ask me anything about it.`;
}

const DEBRIEF_PROMPT = `
Write the athlete's post-run debrief. They have not asked a question — this
lands in their app on its own, minutes after the run finished uploading.

Two or three sentences. The card above them already shows distance, time, pace,
heart rate and the route, so do not repeat those numbers: say what the run was,
whether it fits what they have been doing, and what it means for the next one.
No greeting, no sign-off, no questions back.
`.trim();

/**
 * Reads a run and posts the debrief.
 *
 * Returns the thread it landed in, or null when there was nothing to say — a
 * ride rather than a run, an activity Strava won't show us, or a debrief that
 * already exists for this run.
 */
export async function postRunDebrief(
  userId: string,
  accessToken: string,
  activityId: number,
): Promise<string | null> {
  const log = logger.child({ userId, activityId });
  const today = todayLocal();

  const runs = await fetchRuns(accessToken);
  const run = runs.find((candidate) => candidate.id === activityId);
  if (!run) {
    // `fetchRuns` keeps only run-flavoured sports, so this is the ordinary path
    // for a ride, a swim or a lift — not a failure.
    log.info({ event: "debrief.skipped_not_a_run" }, "Activity is not a run");
    return null;
  }

  const card = await buildRunDebriefCard(accessToken, runs, today, activityId);
  if (!card) return null;

  const config = getCoachConfig();
  let read = withoutModel(card);
  /**
   * The trace the prose was written under, so the athlete can rate a debrief
   * the way they rate an answer they asked for. Stays unset when no model
   * wrote anything — there is nothing to rate but the card, which is our own
   * arithmetic.
   */
  let traceId: string | undefined;
  if (config) {
    const prompt = `${DEBRIEF_PROMPT}\n\nThe run:\n${JSON.stringify(card)}\n\nTheir last few weeks:\n${JSON.stringify(
      runs.slice(0, 12).map((other) => ({
        date: localDate(other),
        km: Number((other.distance / 1000).toFixed(1)),
        type: other.workout_type,
        avg_hr: other.average_heartrate,
      })),
    )}`;
    // The app's other model call, and the only one nobody is watching — so its
    // tokens, latency and stop reason belong in the same LLM analytics as a
    // coach turn rather than being the invisible half of the bill. No replay to
    // link it to and no conversation to group it with: a webhook wrote this.
    const turn = observeTurn({
      distinctId: userId,
      name: "post-run debrief",
      properties: { activity_id: activityId },
    });
    traceId = turn.traceId;

    try {
      const { text } = await generateText({
        model: config.model,
        system: coachSystemPrompt(today, 6),
        prompt,
        ...turn.callbacks,
      });
      if (text.trim()) read = text.trim();
      turn.end({ input: prompt, output: text });
    } catch (err) {
      // A model that is down should cost the athlete the prose, not the card.
      log.error(
        { event: "debrief.model_failed", err },
        "Could not write the debrief",
      );
      turn.end({ input: prompt, error: err });
    }
  }

  const thread = await findOrCreateThread(userId, DEBRIEF_THREAD_TITLE);
  const message: UIMessage = {
    id: messageId(),
    role: "assistant",
    parts: [
      // A data part, not a tool part, even though the browser draws it with the
      // same card component.
      //
      // Nothing called a tool here — the webhook built this card. Storing it as
      // a tool result would put a function call at the head of the thread with
      // no user turn before it, and the next message the athlete sends would
      // come back rejected as "function call turn must come immediately after
      // a user turn". `convertToModelMessages` skips data parts, so the
      // card stays a UI artifact and the text below is what the model reads.
      { type: DEBRIEF_PART, data: card },
      { type: "text", text: read },
    ] as UIMessage["parts"],
    // Same field the chat route sends with a streamed answer: it is what the
    // thumbs on this message will report against.
    ...(traceId ? { metadata: { trace_id: traceId } } : {}),
  };

  await saveMessage(thread.id, message);
  await recordDebrief(userId, activityId, thread.id, message.id);

  // `track()` takes a request context and there isn't one here — a webhook is
  // the one thing the app does with nobody waiting on it. This is still an
  // athlete-facing event, and the only one they didn't ask for, so it goes to
  // PostHog by hand rather than being left out of their timeline.
  const properties = {
    threadId: thread.id,
    activityId,
    model: config?.modelId ?? null,
    written: config !== null,
  };
  log.info(
    { event: "debrief.posted", ...properties },
    "Posted a post-run debrief",
  );
  captureUserEvent({ distinctId: userId, event: "debrief.posted", properties });

  return thread.id;
}
