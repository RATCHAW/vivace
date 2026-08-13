// What the coach knows about the athlete before they say anything.
//
// One page of Strava activities becomes four measured signals, a queue of
// things worth asking about, and the accepted week measured against what was
// actually run. The Coach screen's two rails render this, and the coach's own
// `getTrainingSignals` tool reads the same function — so the number in the rail
// and the number in the answer can never disagree.
import type {
  CoachBriefing,
  CoachContext,
  CoachQueueItem,
  CoachSignal,
  Run,
} from "./schemas.js";
import { getContext, getPlan } from "./coach-store.js";
import { findDebrief } from "./chat-store.js";
import { fetchRunStreams, fetchRuns, fetchShoes, StravaApiError } from "./strava.js";
import {
  clock,
  daysBetween,
  decoupling,
  easyIntensity,
  loadRatio,
  localDate,
  planProgress,
  weeklyVolume,
  weekStart,
  type EasyIntensity,
  type LoadRatio,
} from "./training.js";

/** Today in the athlete's own terms — the analysis never reads a clock itself. */
export function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A run long enough for decoupling to mean something. */
function isLongRun(run: Run): boolean {
  return run.moving_time >= 60 * 60 || run.distance >= 14_000;
}

/** `Aug 5` — the short stamp a signal or queue item is titled with. */
function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** `2 DAYS AGO`, `TODAY` — a mono stamp, not a timestamp to parse. */
function agoStamp(date: string, today: string): string {
  const days = daysBetween(date, today);
  if (days <= 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  return `${days} DAYS AGO`;
}

/** The measured numbers, before they are dressed up as signals. */
export interface TrainingReadout {
  load: LoadRatio | null;
  easy: EasyIntensity | null;
  /** Pa:HR drift on the most recent long run, and which run that was. */
  drift: { percent: number; run: Run } | null;
  shoes: { name: string; km: number }[];
  /**
   * Change in kilometres on the last *completed* week.
   *
   * Deliberately not the week in progress: on a Tuesday that week is two runs
   * long and would read as a 70% collapse. The live overload is what the load
   * ratio is for — it rolls over the last seven days rather than a calendar
   * week, so nothing is missed by letting this one lag.
   */
  ramp_pct: number | null;
}

/**
 * Reads the numbers.
 *
 * Every measurement is allowed to be null — an athlete without a heart-rate
 * monitor still gets a load ratio, and one who has never tagged a long run
 * still gets everything else. Only the signals that could be computed are
 * shown, which is why the rail has no "no data" placeholders in it.
 */
export async function readTraining(
  accessToken: string,
  runs: Run[],
  today: string,
): Promise<TrainingReadout> {
  // Three weeks so that index 1 — the last one that finished — has a week
  // before it to be measured against.
  const weeks = weeklyVolume(runs, 3, today);
  const load = loadRatio(runs, today);
  const easy = easyIntensity(runs);

  // Decoupling needs the run's streams, so it costs a second Strava call — only
  // spent on a long run recent enough to still describe current fitness.
  const recentLong = runs
    .filter((run) => isLongRun(run) && daysBetween(localDate(run), today) <= 28)
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))[0];

  let drift: TrainingReadout["drift"] = null;
  if (recentLong) {
    try {
      const percent = decoupling(await fetchRunStreams(accessToken, recentLong.id));
      if (percent !== null) drift = { percent, run: recentLong };
    } catch (err) {
      // A missing stream is not a reason to fail the whole screen, but it is
      // still a Strava failure and has to be visible.
      if (!(err instanceof StravaApiError)) throw err;
    }
  }

  let shoes: TrainingReadout["shoes"] = [];
  try {
    shoes = (await fetchShoes(accessToken))
      .filter((shoe) => shoe.distance >= 400_000)
      .sort((a, b) => b.distance - a.distance)
      .map((shoe) => ({ name: shoe.name, km: Math.round(shoe.distance / 1000) }));
  } catch (err) {
    if (!(err instanceof StravaApiError)) throw err;
  }

  return { load, easy, drift, shoes, ramp_pct: weeks[1]?.ramp_pct ?? null };
}

/** The safe band for the acute:chronic ratio, as it is usually quoted. */
const ACWR_BAND = { low: 0.8, high: 1.3 };
/** Above this share of easy runs in zone 3, easy running has stopped being easy. */
const EASY_Z3_LIMIT = 0.2;
/** Aerobic decoupling above this is a run held together by effort, not fitness. */
const DRIFT_LIMIT = 5;
/** Foam is done well before the upper looks it. */
const SHOE_RETIRE_KM = 800;

export function toSignals(readout: TrainingReadout): CoachSignal[] {
  const signals: CoachSignal[] = [];

  if (readout.load) {
    const { ratio, acute_km, chronic_km } = readout.load;
    signals.push({
      id: "acwr",
      label: "ACWR · 7:28 day load",
      value: ratio.toFixed(2),
      note:
        ratio > ACWR_BAND.high
          ? `${acute_km} km on a ${chronic_km} km base`
          : ratio < ACWR_BAND.low
            ? `Detraining below ${ACWR_BAND.low}`
            : `Inside the ${ACWR_BAND.low}–${ACWR_BAND.high} band`,
      tone:
        ratio > ACWR_BAND.high || ratio < ACWR_BAND.low
          ? "alert"
          : ratio > 1.2
            ? "warn"
            : "neutral",
      question: "Am I ramping too fast?",
    });
  }

  if (readout.easy) {
    const { share, easy_runs, hard_easy_runs, zone3_floor } = readout.easy;
    signals.push({
      id: "easy-intensity",
      label: "Easy runs in Z3",
      value: `${Math.round(share * 100)}%`,
      note:
        hard_easy_runs === 0
          ? `All ${easy_runs} under ${zone3_floor} bpm`
          : `${hard_easy_runs} of ${easy_runs} over ${zone3_floor} bpm`,
      tone: share > 0.3 ? "alert" : share > EASY_Z3_LIMIT ? "warn" : "neutral",
      question: "Are my easy runs too fast?",
    });
  }

  if (readout.drift) {
    const { percent, run } = readout.drift;
    signals.push({
      id: "decoupling",
      label: "Aerobic decoupling",
      value: `${percent.toFixed(1)}%`,
      note: `${shortDate(localDate(run))} long run`,
      tone: percent > 8 ? "alert" : percent > DRIFT_LIMIT ? "warn" : "neutral",
      question: `Read my ${shortDate(localDate(run))} long run split by split`,
    });
  }

  for (const shoe of readout.shoes.slice(0, 1)) {
    signals.push({
      id: "shoes",
      label: shoe.name,
      value: `${shoe.km} km`,
      note: `Retire at ${SHOE_RETIRE_KM} km`,
      tone:
        shoe.km >= SHOE_RETIRE_KM
          ? "alert"
          : shoe.km >= SHOE_RETIRE_KM * 0.8
            ? "warn"
            : "neutral",
      question: `When should I retire my ${shoe.name}?`,
    });
  }

  return signals;
}

/** Weeks between today and the goal race, rounded up. */
export function weeksToRace(context: CoachContext, today: string): number | null {
  if (!context.race_date) return null;
  const days = daysBetween(today, context.race_date);
  return days < 0 ? null : Math.ceil(days / 7);
}

/**
 * What the coach would raise if the athlete opened the app and said nothing.
 *
 * Ordered by how much it matters today: the run that just landed, then anything
 * measured outside its band, then the goal race. Nothing here is a notification
 * — each item is a question the athlete can hand straight to the coach.
 */
export function toQueue(
  readout: TrainingReadout,
  runs: Run[],
  context: CoachContext,
  today: string,
  /** The thread the webhook already posted a debrief of the latest run into. */
  debriefThreadId: string | null = null,
): CoachQueueItem[] {
  const queue: CoachQueueItem[] = [];

  const latest = runs[0];
  if (latest && daysBetween(localDate(latest), today) <= 10) {
    const date = shortDate(localDate(latest));
    const name = `${date} ${latest.name.toLowerCase()}`;
    queue.push({
      id: "debrief",
      // "Ready" only when it actually is: the webhook writes the debrief
      // minutes after the upload, and until then this is an invitation to ask.
      title: debriefThreadId ? `Debrief ready · ${name}` : `Read your ${name}`,
      when: debriefThreadId
        ? "POSTED AUTOMATICALLY"
        : `LAST RUN · ${agoStamp(localDate(latest), today)}`,
      tone: "neutral",
      question: `Debrief my ${date} run`,
      run_id: latest.id,
      thread_id: debriefThreadId,
    });
  }

  const ramp = readout.ramp_pct;
  const overloaded = (readout.load?.ratio ?? 0) > ACWR_BAND.high;
  if (overloaded || (ramp !== null && ramp >= 25)) {
    queue.push({
      id: "ramp",
      title:
        ramp !== null && ramp >= 25
          ? `Volume jumped ${ramp}% in one week`
          : `Load ratio at ${readout.load?.ratio.toFixed(2)}`,
      when: ramp !== null && ramp >= 25 ? "LAST FULL WEEK" : "ROLLING 7 DAYS",
      tone: "alert",
      question: "Am I ramping too fast?",
      run_id: null,
      thread_id: null,
    });
  }

  const shoe = readout.shoes[0];
  if (shoe && shoe.km >= SHOE_RETIRE_KM * 0.8) {
    queue.push({
      id: "shoes",
      title: `${shoe.name} at ${shoe.km} km`,
      when: "RETIRE SOON",
      tone: shoe.km >= SHOE_RETIRE_KM ? "alert" : "warn",
      question: `When should I retire my ${shoe.name}?`,
      run_id: null,
      thread_id: null,
    });
  }

  const weeks = weeksToRace(context, today);
  if (!context.race_name) {
    queue.push({
      id: "goal",
      title: "No goal race yet — tell me what you're training for",
      when: "SET IT ONCE",
      tone: "neutral",
      question: "I'm training for a race — let me tell you about it",
      run_id: null,
      thread_id: null,
    });
  } else if (weeks !== null && weeks <= 3) {
    queue.push({
      id: "taper",
      title: `${context.race_name} in ${weeks} week${weeks === 1 ? "" : "s"}`,
      when: "TAPER WINDOW",
      tone: "warn",
      question: "Write my taper",
      run_id: null,
      thread_id: null,
    });
  }

  return queue;
}

/** The Coach screen's rails, and the coach's own read on the athlete. */
export async function buildBriefing(
  accessToken: string,
  userId: string,
  today = todayLocal(),
): Promise<CoachBriefing> {
  const [runs, context] = await Promise.all([
    fetchRuns(accessToken),
    getContext(userId),
  ]);

  const readout = await readTraining(accessToken, runs, today);
  const week = weekStart(today);
  const [accepted, debrief] = await Promise.all([
    getPlan(userId, week),
    // Only the latest run's debrief matters here — that is the only one the
    // queue offers to open.
    runs[0] ? findDebrief(userId, runs[0].id) : Promise.resolve(null),
  ]);

  return {
    context,
    plan: accepted
      ? {
          ...planProgress(accepted.sessions, runs, week, today),
          label: accepted.label,
        }
      : null,
    signals: toSignals(readout),
    queue: toQueue(readout, runs, context, today, debrief?.thread_id ?? null),
  };
}

/** The goal race as one line the model can quote back. */
export function describeGoal(context: CoachContext, today: string): string {
  if (!context.race_name) return "No goal race set.";
  const weeks = weeksToRace(context, today);
  const parts = [context.race_name];
  if (context.race_date) parts.push(context.race_date);
  if (weeks !== null) parts.push(`${weeks} weeks out`);
  if (context.target_seconds) parts.push(`target ${clock(context.target_seconds)}`);
  return parts.join(" · ");
}
