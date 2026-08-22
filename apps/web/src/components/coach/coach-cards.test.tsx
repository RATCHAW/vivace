import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { i18n } from "@/i18n";
import {
  CoachCardView,
  type CardActions,
  type CoachCard,
  type DebriefCard,
  type PlanCard,
  type PredictionCard,
  type SplitsCard,
  type VolumeCard,
} from "./coach-cards";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
});

const actions: CardActions = {
  onAsk: vi.fn(),
  onAcceptPlan: vi.fn(),
};

function show(card: CoachCard) {
  return render(
    <MemoryRouter>
      <CoachCardView actions={actions} card={card} />
    </MemoryRouter>,
  );
}

const debrief: DebriefCard = {
  card: "run-debrief",
  run_id: 1,
  title: "Morning run",
  date: "5 Aug",
  stamp: "LAST RUN",
  route_path: null,
  line: "Even from front to back.",
  stats: [{ label: "Distance", value: "10.0 km" }],
  elevation_m: 42,
  calories: 610,
};

const splits: SplitsCard = {
  card: "run-splits",
  run_id: 1,
  title: "Morning run",
  splits: [
    { km: 1, pace_per_km: "5:10", seconds_per_km: 310, avg_heartrate: 150 },
    { km: 2, pace_per_km: "5:20", seconds_per_km: 320, avg_heartrate: 158 },
  ],
  first_half_pace: "5:10",
  second_half_pace: "5:20",
  fade_seconds_per_km: 10,
  decoupling_pct: 6.2,
  avg_heartrate: 154,
  max_heartrate: 171,
};

const volume: VolumeCard = {
  card: "training-volume",
  weeks: [
    {
      week_starting: "2026-08-10",
      runs: 4,
      km: 42,
      avg_pace_per_km: "5:30",
      ramp_pct: 5,
    },
  ],
  load: { acute_km: 42, chronic_km: 38, ratio: 1.11 },
  easy_intensity: null,
};

const prediction: PredictionCard = {
  card: "race-prediction",
  efforts: [
    { name: "10k", time: "44:10", date: "5 Aug", pr: true, activity_id: 1 },
  ],
  predictions: [
    {
      name: "Half marathon",
      time: "1:37:40",
      pace_per_km: "4:38",
      from: { name: "10k", time: "44:10", date: "5 Aug" },
    },
  ],
  goal: null,
};

const plan: PlanCard = {
  card: "week-plan",
  week_starting: "2026-08-17",
  label: "Build 4 of 9",
  sessions: [
    { day: 0, type: "Easy", km: 8, pace: "6:00 /km", key: false },
    { day: 5, type: "Long", km: 18, pace: "5:50 /km", key: true },
  ],
  total_km: 26,
  quality: 1,
  accepted: false,
};

describe("accepting a week", () => {
  function showPlan(card: PlanCard, extra: Partial<CardActions> = {}) {
    return render(
      <MemoryRouter>
        <CoachCardView actions={{ ...actions, ...extra }} card={card} />
      </MemoryRouter>,
    );
  }

  it("says it is working while the accept is in flight", () => {
    showPlan(plan, { acceptingWeek: plan.week_starting });

    // Not just greyed out: a disabled pill with the same words on it reads as
    // a press that did nothing, which is what sent the athlete to press again.
    const button = screen.getByRole("button", {
      name: "Adding it to your week…",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.querySelector(".animate-spin")).not.toBeNull();
  });

  it("leaves the other weeks in the conversation alone", () => {
    // A thread that reworked a plan holds several of these. Only the one that
    // was pressed is waiting on anything.
    showPlan(plan, { acceptingWeek: "2026-08-24" });

    expect(
      screen
        .getByRole("button", { name: "Accept this week" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
});

describe("card help", () => {
  it.each([
    ["run-splits", splits, "Your splits", 3, /Decoupling compares pace/],
    ["training-volume", volume, "Weekly volume", 2, /Acute:chronic puts/],
    ["race-prediction", prediction, "Race prediction", 3, /Riegel stretches/],
    ["week-plan", plan, "This week", 2, /Ask before moving a key one/],
  ] as const)(
    "keys the %s card with the ink itself",
    (_name, card, title, marks, note) => {
      show(card);

      // Closed by default: the key is there for the first read, not in the way
      // of every one after it.
      expect(screen.queryByText(note)).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "What am I looking at?" }),
      );

      // Scoped to the panel: "Race prediction" is also the card's own heading,
      // and the point is that the key is what opened.
      const panel = document.querySelector('[data-slot="popover-content"]');
      expect(panel?.textContent).toContain(title);

      // A row per mark on the card, each one drawn rather than described — a
      // legend that spells a colour out in a sentence is a legend nobody reads.
      expect(panel?.querySelectorAll("li")).toHaveLength(marks);
      // And exactly one sentence, spent on what no swatch can show.
      expect(panel?.querySelectorAll("p")).toHaveLength(1);
      expect(panel?.textContent).toMatch(note);
    },
  );

  it("draws each swatch in the ink the card actually uses", () => {
    show(volume);
    fireEvent.click(
      screen.getByRole("button", { name: "What am I looking at?" }),
    );

    // A legend that drifts from its chart is worse than no legend, because it
    // is believed. Cobalt for a normal week, pink for a jump — the same two
    // classes `TrainingVolume` picks between.
    const swatches = [
      ...(document
        .querySelector('[data-slot="popover-content"]')
        ?.querySelectorAll("li span:first-child > span") ?? []),
    ].map((mark) => mark.className);

    expect(swatches[0]).toContain("bg-brand");
    expect(swatches[1]).toContain("bg-chart-3");
  });

  it("keeps the explanation out of the way until it is asked for", () => {
    show(volume);

    // No inline paragraph, no permanent legend — the card is the content.
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  });

  it("leaves the run debrief alone", () => {
    // A route and a row of stats explain themselves. A `?` on every card
    // teaches the reader that it never says anything, and then it never does.
    show(debrief);

    expect(
      screen.queryByRole("button", { name: "What am I looking at?" }),
    ).toBeNull();
  });

  it("keys the card in the language the athlete is reading", async () => {
    await i18n.changeLanguage("fr");
    show(volume);

    fireEvent.click(
      screen.getByRole("button", { name: "Qu’est-ce que je regarde ?" }),
    );
    expect(screen.getByText("Les kilomètres d’une semaine")).toBeDefined();
    expect(screen.getByText(/La charge aiguë\/chronique/)).toBeDefined();
  });
});
