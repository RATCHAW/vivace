/**
 * Dates, in the athlete's language.
 *
 * Every one of these replaced a hard-coded `Intl.DateTimeFormat("en-US", …)`
 * scattered through a component. They live together because they are a house
 * style as much as a locale question: a run is always dated the same way
 * wherever it appears, and `formatWeek` is uppercased because it stamps a
 * mono eyebrow under a bar chart.
 *
 * `formatters()` is pure and takes its locale, so the tests can assert both
 * languages without rendering anything. `useFormatters()` is the hook
 * components actually call.
 */
import { useMemo } from "react";
import { useIntlLocale } from "./index";

export interface Formatters {
  /** `5 Aug 2026` — a run in a list, where the year matters. */
  runDate(iso: string): string;
  /** `5 Aug` — a run in a chip, where it does not. */
  shortDate(iso: string): string;
  /** `5 AUG` — the mono stamp under a bar. Takes a `YYYY-MM-DD` day. */
  weekStamp(day: string): string;
  /** `Sun 18 Oct` — the way a race day is written on a start list. */
  raceDay(day: string): string;
  /** A conversation's own day, in the browser's timezone rather than UTC. */
  threadDate(iso: string): string;
  /** `5 August 2026` — a profile fact, spelled out. */
  longDate(iso: string): string;
}

/**
 * Strava's `start_date_local` carries the athlete's wall clock with a `Z`
 * suffix, so every one of these formats in UTC — read in local time, a run
 * started at 23:30 on New Year's Eve lands in the wrong year.
 */
const UTC = "UTC" as const;

export function formatters(locale: string): Formatters {
  const run = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: UTC,
  });
  const short = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: UTC,
  });
  const race = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: UTC,
  });
  const thread = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });
  const long = new Intl.DateTimeFormat(locale, { dateStyle: "long" });

  return {
    runDate: (iso) => run.format(new Date(iso)),
    shortDate: (iso) => short.format(new Date(iso)),
    weekStamp: (day) => short.format(midnightUtc(day)).toUpperCase(),
    raceDay: (day) => race.format(midnightUtc(day)),
    threadDate: (iso) => thread.format(new Date(iso)),
    longDate: (iso) => long.format(new Date(iso)),
  };
}

/** A `YYYY-MM-DD` day as an instant, without the browser's timezone joining in. */
function midnightUtc(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function useFormatters(): Formatters {
  const locale = useIntlLocale();
  return useMemo(() => formatters(locale), [locale]);
}
