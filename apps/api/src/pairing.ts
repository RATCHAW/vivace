// Which of the invitee's runs was the same run.
//
// This never has to be *right*. The invitee confirms the match themselves, so
// all this has to do is put the obvious answer first and keep the list short —
// which is a much cheaper problem than an unattended matcher, and the reason
// the invite asks rather than infers.
//
// Pure on purpose: no database, no Strava, no clock of its own. The rules below
// are the interesting part of this feature and they are all testable without a
// fixture.
import type { Run } from "./schemas.js";

/**
 * How far apart two starts may be and still be the same run.
 *
 * Generous because nothing normalises device clocks, and because "we started
 * together" in practice means one person's watch caught GPS a minute before the
 * other's. The overlap score below is what actually separates the candidates;
 * this only decides what is worth showing at all.
 */
const START_WINDOW_SECONDS = 30 * 60;

/**
 * Comparing two athletes' `start_date_local` is normally a bug — it is a wall
 * clock with a `Z` stapled to it, so two runners in different zones read as
 * hours apart when they started together.
 *
 * It is the right field *here*, and only here: two people who ran the same run
 * were in the same place, so their wall clocks agree by construction. The trap
 * is comparing across athletes who were not together, and those are exactly the
 * candidates this is meant to reject.
 */
function startedAt(run: Run): number {
  return Date.parse(run.start_date_local);
}

/**
 * Strava obscures a hidden start time as midnight plus one second, local.
 *
 * Two runs hidden on the same day therefore both read `00:00:01` and score as a
 * flawless match — the one false positive this whole feature could produce that
 * looks like a true one. They are dropped rather than ranked: an athlete who
 * hides their start times can still pick from the full list by hand.
 *
 * https://developers.strava.com/docs/changelog/ (3 July 2024)
 */
export function hasObscuredStart(run: Run): boolean {
  const at = new Date(run.start_date_local);
  return (
    at.getUTCHours() === 0 &&
    at.getUTCMinutes() === 0 &&
    at.getUTCSeconds() === 1
  );
}

/** Seconds the two runs were both in progress. */
function overlapSeconds(a: Run, b: Run): number {
  const aStart = startedAt(a);
  const bStart = startedAt(b);
  const aEnd = aStart + a.moving_time * 1000;
  const bEnd = bStart + b.moving_time * 1000;
  const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
  return overlap > 0 ? overlap / 1000 : 0;
}

/**
 * 0–1, how much the same run these two look like.
 *
 * Overlap carries most of it: two people on the same road were running at the
 * same time, and nothing else available here is as discriminating. Distance is
 * a tie-breaker rather than a test, because one of them stopping their watch at
 * the door and the other at the corner is normal and should not cost the match.
 */
export function matchScore(target: Run, candidate: Run): number {
  const shorter = Math.min(target.moving_time, candidate.moving_time);
  if (shorter <= 0) return 0;

  const overlap = overlapSeconds(target, candidate) / shorter;
  if (overlap <= 0) return 0;

  const longest = Math.max(target.distance, candidate.distance);
  const similarity =
    longest > 0
      ? 1 - Math.abs(target.distance - candidate.distance) / longest
      : 1;

  return overlap * 0.8 + Math.max(0, similarity) * 0.2;
}

export interface RunMatch {
  run: Run;
  /** 0–1. Shown to nobody: it orders the list, and the athlete decides. */
  score: number;
}

/**
 * The invitee's runs that could plausibly be the other half of `target`, best
 * first.
 *
 * Deliberately permissive. A candidate that scores badly is still a candidate —
 * the cost of hiding the right run from someone who knows perfectly well which
 * one it was is far higher than the cost of showing them four.
 */
export function rankCandidates(
  target: Run,
  candidates: readonly Run[],
  limit = 5,
): RunMatch[] {
  if (hasObscuredStart(target)) return [];

  const targetStart = startedAt(target);

  return candidates
    .filter((run) => !hasObscuredStart(run))
    .filter(
      (run) =>
        Math.abs(startedAt(run) - targetStart) <= START_WINDOW_SECONDS * 1000,
    )
    .map((run) => ({ run, score: matchScore(target, run) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.run.id - b.run.id)
    .slice(0, limit);
}
