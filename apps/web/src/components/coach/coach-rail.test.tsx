import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CoachBriefing, PlanProgress } from "@/api";
import { i18n } from "@/i18n";
import {
  CoachRail,
  countdown,
  countdownWeeks,
  paceValue,
  planDayState,
  raceDistanceKey,
  targetPace,
  todayIndex,
  weeksToTaper,
} from "./coach-rail";

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await i18n.changeLanguage("en");
});

type PlanDay = NonNullable<PlanProgress>["days"][number];

function day(over: Partial<PlanDay> & { day: number }): PlanDay {
  return {
    type: "Rest",
    planned_km: 0,
    actual_km: 0,
    planned_pace: "",
    actual_pace: null,
    run_ids: [],
    ...over,
  };
}

/** The week in the screenshot the redesign came from: two sessions, none run. */
function plan(over: Partial<NonNullable<PlanProgress>> = {}) {
  return {
    week_starting: "2026-08-17",
    label: "Build 4 of 9",
    planned_km: 14,
    actual_km: 0,
    remaining: 2,
    days: [
      day({ day: 0 }),
      day({ day: 1 }),
      day({ day: 2 }),
      day({ day: 3 }),
      day({ day: 4 }),
      day({ day: 5, type: "Long", planned_km: 8, planned_pace: "6:00 /km" }),
      day({ day: 6, type: "Easy", planned_km: 6, planned_pace: "6:30 /km" }),
    ],
    ...over,
  } satisfies NonNullable<PlanProgress>;
}

function briefing(over: Partial<CoachBriefing> = {}): CoachBriefing {
  return {
    context: {
      race_name: null,
      race_date: null,
      race_distance_m: null,
      target_seconds: null,
      long_run_day: null,
      notes: null,
      updated_at: null,
    },
    plan: plan(),
    signals: [],
    queue: [],
    ...over,
  };
}

/** A goal race with everything filled in; each test empties what it is about. */
function goal(
  over: Partial<CoachBriefing["context"]> = {},
): CoachBriefing["context"] {
  return {
    race_name: "Casablanca Half",
    race_date: "2026-10-18",
    race_distance_m: 21097.5,
    target_seconds: 5880,
    long_run_day: 6,
    notes: null,
    updated_at: null,
    ...over,
  };
}

/** Monday of the fixture week, so `todayIndex` lands where a test wants it. */
function onDay(offset: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 17 + offset, 9, 0, 0));
}

/** A calendar day, 1-indexed on the month, for the countdown to be read from. */
function at(year: number, month: number, day: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(year, month - 1, day, 9, 0, 0));
}

describe("todayIndex", () => {
  it("reads the browser's calendar day, not UTC's", () => {
    // 23:30 local on the Wednesday. `toISOString()` would already say Thursday
    // anywhere east of Greenwich, and the marker would sit on the wrong column.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 23, 30, 0));
    expect(todayIndex("2026-08-17")).toBe(2);
  });

  it("is null for a week that isn't the one being lived", () => {
    onDay(0);
    expect(todayIndex("2026-08-03")).toBeNull();
    expect(todayIndex("not-a-date")).toBeNull();
  });
});

describe("paceValue", () => {
  it("pulls the pace out of however the coach wrote it", () => {
    expect(paceValue("4:35 /km")).toBe("4:35");
    expect(paceValue("around 5:20 per km")).toBe("5:20");
  });

  it("keeps a range whole", () => {
    // "6:00" alone would promise a precision the week never had.
    expect(paceValue("6:00-6:15 /km")).toBe("6:00-6:15");
    expect(paceValue("6:00 – 6:15")).toBe("6:00 – 6:15");
  });

  it("is null for a note that is not a pace", () => {
    expect(paceValue("conversational")).toBeNull();
    expect(paceValue("legs up")).toBeNull();
    expect(paceValue("")).toBeNull();
  });
});

describe("countdown", () => {
  it("counts weeks the way the API's queue counts them", () => {
    // Rounded up, like `weeksToRace` — the queue's taper item and the card's
    // countdown are on screen together and cannot disagree by one.
    expect(countdown("2026-10-18", new Date(2026, 7, 30))).toEqual({
      kind: "weeks",
      value: 7,
    });
    expect(countdown("2026-10-18", new Date(2026, 8, 1))).toEqual({
      kind: "weeks",
      value: 7,
    });
  });

  it("counts days once the race is inside a fortnight", () => {
    expect(countdown("2026-10-18", new Date(2026, 9, 5))).toEqual({
      kind: "days",
      value: 13,
    });
    expect(countdown("2026-10-18", new Date(2026, 9, 4))).toEqual({
      kind: "weeks",
      value: 2,
    });
  });

  it("reads the browser's calendar, not UTC's", () => {
    // 23:30 the night before. `toISOString()` already says race day anywhere
    // east of Greenwich, and the card would count a day the athlete still has.
    expect(countdown("2026-10-18", new Date(2026, 9, 17, 23, 30))).toEqual({
      kind: "days",
      value: 1,
    });
  });

  it("tells a race with no date from one that has been run", () => {
    // Both used to render as the same em dash under "To go".
    expect(countdown(null)).toEqual({ kind: "none" });
    expect(countdown("not-a-date")).toEqual({ kind: "none" });
    expect(countdown("2026-10-18", new Date(2026, 9, 18))).toEqual({
      kind: "today",
    });
    expect(countdown("2026-10-18", new Date(2026, 9, 19))).toEqual({
      kind: "past",
    });
  });
});

describe("countdownWeeks", () => {
  it("marks the last three weeks as the taper", () => {
    const { overflow, weeks } = countdownWeeks(5);
    expect(overflow).toBe(0);
    expect(weeks.map(({ week }) => week)).toEqual([5, 4, 3, 2, 1]);
    expect(weeks.filter(({ taper }) => taper).map(({ week }) => week)).toEqual([
      3, 2, 1,
    ]);
  });

  it("carries the weeks that don't fit as a count rather than dropping them", () => {
    const { overflow, weeks } = countdownWeeks(20);
    expect(overflow).toBe(8);
    expect(weeks).toHaveLength(12);
    expect(weeks[0].week).toBe(12);
    expect(weeks.at(-1)).toEqual({ week: 1, taper: true });
  });
});

describe("weeksToTaper", () => {
  it("counts the weeks until the taper starts", () => {
    expect(weeksToTaper({ kind: "weeks", value: 9 })).toBe(6);
    expect(weeksToTaper({ kind: "weeks", value: 4 })).toBe(1);
  });

  it("is zero once the athlete is inside the window", () => {
    // Three weeks is where `briefing.ts` starts raising the taper itself.
    expect(weeksToTaper({ kind: "weeks", value: 3 })).toBe(0);
    expect(weeksToTaper({ kind: "days", value: 6 })).toBe(0);
    expect(weeksToTaper({ kind: "today" })).toBe(0);
  });

  it("has nothing to say without a race to taper for", () => {
    expect(weeksToTaper({ kind: "none" })).toBeNull();
    expect(weeksToTaper({ kind: "past" })).toBeNull();
  });
});

describe("targetPace", () => {
  it("says how fast the target is, not only what it is", () => {
    expect(targetPace(5880, 21097.5)).toBe("4:39");
  });

  it("invents nothing from half a goal", () => {
    expect(targetPace(5880, null)).toBeNull();
    expect(targetPace(null, 21097.5)).toBeNull();
  });
});

describe("raceDistanceKey", () => {
  it("names the distance the way the athlete would", () => {
    expect(raceDistanceKey(21097.5)).toBe("rail.raceHalf");
    // A half typed in as a round number is still a half.
    expect(raceDistanceKey(21100)).toBe("rail.raceHalf");
    expect(raceDistanceKey(42195)).toBe("rail.raceMarathon");
  });

  it("has no name for a distance that isn't one", () => {
    expect(raceDistanceKey(15000)).toBeNull();
    expect(raceDistanceKey(null)).toBeNull();
  });
});

describe("planDayState", () => {
  it("calls a planned day missed only once it is behind the athlete", () => {
    const tuesday = day({ day: 1, type: "Easy", planned_km: 8 });
    expect(planDayState(tuesday, 1)).toBe("todo");
    expect(planDayState(tuesday, 2)).toBe("missed");
    expect(planDayState(tuesday, null)).toBe("todo");
  });

  it("separates a rest day from a day still owed", () => {
    expect(planDayState(day({ day: 0 }), 3)).toBe("rest");
    expect(planDayState(day({ day: 0, planned_km: 8 }), 3)).toBe("missed");
  });

  it("counts a run nobody planned as done", () => {
    expect(planDayState(day({ day: 0, actual_km: 5 }), 3)).toBe("done");
  });
});

describe("goal race", () => {
  it("leads with the countdown and names the distance", () => {
    at(2026, 8, 30);
    render(
      <CoachRail briefing={briefing({ context: goal() })} onAsk={vi.fn()} />,
    );

    // "7 wk" used to be one of three figures at the foot of the card, two of
    // which were usually an em dash.
    expect(screen.getByText("7 weeks to go")).toBeDefined();
    expect(screen.getByText("Half marathon")).toBeDefined();
  });

  it("says how fast the target is, not only what it is", () => {
    at(2026, 8, 30);
    render(
      <CoachRail briefing={briefing({ context: goal() })} onAsk={vi.fn()} />,
    );

    expect(screen.getByText("1:38:00")).toBeDefined();
    expect(screen.getByText("4:39 /km")).toBeDefined();
    // Two columns leave room for the day's name; three only ever fit "Sun".
    expect(screen.getByText("Sunday")).toBeDefined();
  });

  it("draws a mark a week, and says in words what they mean", () => {
    at(2026, 7, 12);
    const { container } = render(
      <CoachRail briefing={briefing({ context: goal() })} onAsk={vi.fn()} />,
    );

    // Fourteen weeks out: twelve marks fit the rail and the other two are
    // carried at the head of the row rather than dropped off it.
    expect(container.querySelectorAll("[data-week]")).toHaveLength(12);
    expect(screen.getByText("+2")).toBeDefined();
    expect(
      [...container.querySelectorAll("[data-taper]")].map((mark) =>
        mark.getAttribute("data-week"),
      ),
    ).toEqual(["3", "2", "1"]);

    // The shape never stands alone: the number above and the sentence below say
    // everything it draws, which is what lets it be aria-hidden.
    expect(screen.getByText("14 weeks to go")).toBeDefined();
    expect(screen.getByText("Taper starts in 11 weeks")).toBeDefined();

    // Told apart by density, never by hue. Amber is spoken for in this column:
    // the week card below uses it for a session the athlete missed, and the
    // signals under that for a reading out of band.
    expect(container.innerHTML).not.toContain("chart-5");
  });

  it("has no marks to draw inside a fortnight", () => {
    at(2026, 10, 12);
    const { container } = render(
      <CoachRail briefing={briefing({ context: goal() })} onAsk={vi.fn()} />,
    );

    // Two marks is not a countdown. At this range the number is the shape.
    expect(container.querySelectorAll("[data-week]")).toHaveLength(0);
    expect(screen.getByText("6 days to go")).toBeDefined();
    expect(screen.getByText("You’re in the taper window")).toBeDefined();
  });

  it("draws nothing for a stat the athlete never set", () => {
    at(2026, 8, 30);
    render(
      <CoachRail
        briefing={briefing({
          context: goal({ target_seconds: null, long_run_day: null }),
        })}
        onAsk={vi.fn()}
      />,
    );

    expect(screen.queryByText("Target")).toBeNull();
    expect(screen.queryByText("Long day")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("shows what the coach remembers instead of promising it", () => {
    at(2026, 8, 30);
    render(
      <CoachRail
        briefing={briefing({
          context: goal({ notes: "Left achilles, no Tuesday sessions" }),
        })}
        onAsk={vi.fn()}
      />,
    );

    expect(screen.getByText("Remembers")).toBeDefined();
    const notes = screen.getByText("Left achilles, no Tuesday sessions");
    // Session replay is on, and an injury is the athlete's health.
    expect(notes.className).toContain("ph-no-capture");
  });

  it("offers the next race once this one has been run", () => {
    at(2026, 10, 20);
    const onAsk = vi.fn();
    render(
      <CoachRail briefing={briefing({ context: goal() })} onAsk={onAsk} />,
    );

    expect(screen.getByText("That race has been run")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Set the next one" }));
    expect(onAsk).toHaveBeenCalledWith(
      "I’m training for a race — let me tell you about it",
    );
  });

  it("keys its own marks behind the ?", () => {
    at(2026, 8, 30);
    render(
      <CoachRail briefing={briefing({ context: goal() })} onAsk={vi.fn()} />,
    );

    // The marks may be drawn without a legend under them precisely because
    // this exists — and "taper" is a coaching word, so an athlete meeting it
    // for the first time gets a sentence rather than having to go looking.
    const [help] = screen.getAllByRole("button", {
      name: "What am I looking at?",
    });
    fireEvent.click(help);

    const panel = document.querySelector('[data-slot="popover-content"]');
    expect(panel?.textContent).toContain("Your goal race");
    // Two marks on the card, two rows in the key, each one drawn in the ink it
    // stands for rather than spelled out in a sentence about a colour.
    expect(panel?.textContent).toContain("A week to go");
    expect(panel?.textContent).toContain("Taper week");
    expect(panel?.querySelectorAll("li")).toHaveLength(2);
    // "Taper" is a coaching word, and the one thing here no swatch can show.
    expect(panel?.textContent).toMatch(/Tapering is cutting volume/);
  });

  it("still offers a goal to an athlete without one", () => {
    at(2026, 8, 30);
    const onAsk = vi.fn();
    render(<CoachRail briefing={briefing()} onAsk={onAsk} />);

    fireEvent.click(screen.getByRole("button", { name: "Set a goal race" }));
    expect(onAsk).toHaveBeenCalledWith(
      "I’m training for a race — let me tell you about it",
    );
  });
});

describe("this week", () => {
  it("spells every session out, with the unit on each number", () => {
    onDay(0);
    render(<CoachRail briefing={briefing()} onAsk={vi.fn()} />);

    expect(screen.getByText("0 of 14 km")).toBeDefined();
    expect(screen.getByText("Build 4 of 9")).toBeDefined();
    // A bare "8" under a bar said nothing about what it counted, or about
    // whether it was a target or a result. Each session now names itself.
    expect(screen.getByText("Long")).toBeDefined();
    expect(screen.getByText("8 km · 6:00 /km")).toBeDefined();
    expect(screen.getByText("6 km · 6:30 /km")).toBeDefined();
    expect(screen.getByText("2 sessions left")).toBeDefined();
  });

  it("shows the pace that was run, not the one that was asked for", () => {
    onDay(6);
    render(
      <CoachRail
        briefing={briefing({
          plan: plan({
            actual_km: 8,
            remaining: 1,
            days: [
              day({ day: 0 }),
              day({ day: 1 }),
              day({ day: 2 }),
              day({ day: 3 }),
              day({ day: 4 }),
              day({
                day: 5,
                type: "Long",
                planned_km: 8,
                actual_km: 8,
                planned_pace: "6:00 /km",
                actual_pace: "5:44",
              }),
              day({ day: 6, type: "Easy", planned_km: 6 }),
            ],
          }),
        })}
        onAsk={vi.fn()}
      />,
    );

    expect(screen.getByText("8 km · 5:44 /km")).toBeDefined();
    expect(screen.queryByText("8 km · 6:00 /km")).toBeNull();
    expect(
      screen.getByText(/Saturday · Long · ran 8 of 8 km · at 5:44/),
    ).toBeDefined();
  });

  it("does not call a run nobody planned a rest day", () => {
    onDay(6);
    render(
      <CoachRail
        briefing={briefing({
          plan: plan({
            actual_km: 5,
            days: [
              // The briefing types a day with no session "Rest". On a line of
              // its own, next to 5 km that were actually run, that reads wrong.
              day({ day: 0, actual_km: 5, actual_pace: "5:30" }),
              day({ day: 1 }),
              day({ day: 2 }),
              day({ day: 3 }),
              day({ day: 4 }),
              day({ day: 5, type: "Long", planned_km: 8 }),
              day({ day: 6, type: "Easy", planned_km: 6 }),
            ],
          }),
        })}
        onAsk={vi.fn()}
      />,
    );

    expect(screen.getByText("Unplanned")).toBeDefined();
    expect(screen.queryByText("Rest")).toBeNull();
    expect(screen.getByText("5 km · 5:30 /km")).toBeDefined();
    expect(
      screen.getByText("Monday · unplanned · ran 5 km · at 5:30 /km"),
    ).toBeDefined();
  });

  it("leaves the pace off a session the coach wrote as a note", () => {
    onDay(0);
    render(
      <CoachRail
        briefing={briefing({
          plan: plan({
            days: [
              day({ day: 0 }),
              day({ day: 1 }),
              day({ day: 2 }),
              day({ day: 3 }),
              day({ day: 4 }),
              day({
                day: 5,
                type: "Long",
                planned_km: 8,
                planned_pace: "conversational",
              }),
              day({ day: 6, type: "Easy", planned_km: 6 }),
            ],
          }),
        })}
        onAsk={vi.fn()}
      />,
    );

    // The distance still stands on its own; nothing is invented for the pace.
    expect(screen.getByText("8 km")).toBeDefined();
    expect(screen.getByText("6 km")).toBeDefined();
  });

  it("gives a rest day no mark at all", () => {
    onDay(0);
    const { container } = render(
      <CoachRail briefing={briefing()} onAsk={vi.fn()} />,
    );

    const marks = container.querySelectorAll("[data-state]");
    expect([...marks].map((mark) => mark.getAttribute("data-day"))).toEqual([
      "5",
      "6",
    ]);
  });

  it("marks a planned day the athlete has run past", () => {
    onDay(6);
    const { container } = render(
      <CoachRail briefing={briefing()} onAsk={vi.fn()} />,
    );

    expect(
      container.querySelector<HTMLElement>('[data-day="5"]')?.dataset.state,
    ).toBe("missed");
    expect(
      container.querySelector<HTMLElement>('[data-day="6"]')?.dataset.state,
    ).toBe("todo");
  });

  it("fills the mark with what was run, not with what was planned", () => {
    onDay(6);
    const { container } = render(
      <CoachRail
        briefing={briefing({
          plan: plan({
            actual_km: 4,
            remaining: 1,
            days: [
              day({ day: 0 }),
              day({ day: 1 }),
              day({ day: 2 }),
              day({ day: 3 }),
              day({ day: 4 }),
              day({ day: 5, type: "Long", planned_km: 8, actual_km: 4 }),
              day({ day: 6, type: "Easy", planned_km: 6 }),
            ],
          }),
        })}
        onAsk={vi.fn()}
      />,
    );

    const saturday = container.querySelector<HTMLElement>('[data-day="5"]');
    expect(saturday?.dataset.state).toBe("done");
    expect(saturday?.querySelector<HTMLElement>("span")?.style.height).toBe(
      "50%",
    );
    // The session's own line reads what was run, not what was asked for.
    expect(screen.getByText("4 km")).toBeDefined();
  });

  it("reads each session out for a screen reader", () => {
    onDay(5);
    render(<CoachRail briefing={briefing()} onAsk={vi.fn()} />);

    // Colour is all that separates a session that happened from one still
    // owed, so the readout says it — and says which of the two the pace is.
    expect(
      screen.getByText(
        "Saturday · Long · 8 km still to run · target 6:00 /km — Today",
      ),
    ).toBeDefined();
    expect(
      screen.getByText("Sunday · Easy · 6 km still to run · target 6:30 /km"),
    ).toBeDefined();
    // The chart is a shape, not a second copy of those sentences.
    expect(screen.queryByText(/rest day/)).toBeNull();
  });

  it("keys the chart behind the ? instead of under the card", () => {
    onDay(0);
    render(<CoachRail briefing={briefing()} onAsk={vi.fn()} />);

    // The legend used to be a paragraph every visit re-read. It explains an
    // encoding, which is a thing you look up once.
    expect(screen.queryByText(/Filled is what you ran/)).toBeNull();

    // The week's `?` is the second on screen; the goal race owns the first.
    const help = screen.getAllByRole("button", {
      name: "What am I looking at?",
    });
    fireEvent.click(help[help.length - 1]);

    const panel = document.querySelector('[data-slot="popover-content"]');
    expect(panel?.textContent).toContain("Your week");
    // Three states on the chart, three rows in the key, each drawn as itself.
    expect(
      [...(panel?.querySelectorAll("li") ?? [])].map((row) => row.textContent),
    ).toEqual(["What you ran", "Still to run", "Missed — that day has gone"]);
  });

  it("asks the coach to adjust the week", () => {
    onDay(0);
    const onAsk = vi.fn();
    render(<CoachRail briefing={briefing()} onAsk={onAsk} />);

    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    expect(onAsk).toHaveBeenCalledWith("Adjust this week for me");
  });

  it("says the week is complete instead of naming a next session", () => {
    onDay(6);
    render(
      <CoachRail
        briefing={briefing({
          plan: plan({
            actual_km: 14,
            remaining: 0,
            days: [
              day({ day: 0 }),
              day({ day: 1 }),
              day({ day: 2 }),
              day({ day: 3 }),
              day({ day: 4 }),
              day({ day: 5, type: "Long", planned_km: 8, actual_km: 8 }),
              day({ day: 6, type: "Easy", planned_km: 6, actual_km: 6 }),
            ],
          }),
        })}
        onAsk={vi.fn()}
      />,
    );

    expect(screen.getByText("Week complete")).toBeDefined();
  });

  it("still offers a week when the athlete has none", () => {
    const onAsk = vi.fn();
    render(<CoachRail briefing={briefing({ plan: null })} onAsk={onAsk} />);

    fireEvent.click(screen.getByRole("button", { name: "Plan my week" }));
    expect(onAsk).toHaveBeenCalledWith("Plan my week");
  });
});
