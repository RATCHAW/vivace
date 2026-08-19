import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CoachBriefing, PlanProgress } from "@/api";
import { i18n } from "@/i18n";
import { CoachRail, planDayState, todayIndex } from "./coach-rail";

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await i18n.changeLanguage("en");
});

type PlanDay = NonNullable<PlanProgress>["days"][number];

function day(over: Partial<PlanDay> & { day: number }): PlanDay {
  return { type: "Rest", planned_km: 0, actual_km: 0, run_ids: [], ...over };
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
      day({ day: 5, type: "Long", planned_km: 8 }),
      day({ day: 6, type: "Easy", planned_km: 6 }),
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
  it("puts the numbers on the card rather than in a tooltip", () => {
    onDay(0);
    render(<CoachRail briefing={briefing()} onAsk={vi.fn()} />);

    expect(screen.getByText("0 of 14 km")).toBeDefined();
    expect(screen.getByText("Build 4 of 9")).toBeDefined();
    // The two sessions are labelled with their kilometres, so a bar's height
    // converts to a number without hovering anything.
    expect(screen.getByText("8")).toBeDefined();
    expect(screen.getByText("6")).toBeDefined();
    expect(
      screen.getByText("2 sessions left · next Sat, Long, 8 km"),
    ).toBeDefined();
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
    // The day's own label reads what was run, not what was asked for.
    expect(screen.getByText("4")).toBeDefined();
  });

  it("reads each day out for a screen reader", () => {
    onDay(0);
    render(<CoachRail briefing={briefing()} onAsk={vi.fn()} />);

    expect(screen.getByText(/Monday · rest day/)).toBeDefined();
    expect(
      screen.getByText("Saturday · Long · 8 km still to run"),
    ).toBeDefined();
    expect(screen.getByText(/Monday · rest day — Today/)).toBeDefined();
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
