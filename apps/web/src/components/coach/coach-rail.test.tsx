import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CoachBriefing, PlanProgress } from "@/api";
import { i18n } from "@/i18n";
import { CoachRail, paceValue, planDayState, todayIndex } from "./coach-rail";

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

/** Monday of the fixture week, so `todayIndex` lands where a test wants it. */
function onDay(offset: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 17 + offset, 9, 0, 0));
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
