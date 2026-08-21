// "What am I looking at?" — the key to a card, behind a `?` in its heading.
//
// Shared by the cards the coach draws in the transcript (coach-cards.tsx) and
// by the rail's two sections (coach-rail.tsx), so a mark is explained in one
// place however the athlete arrives at it.
//
// It is a legend, not an essay. Every row *is* the ink it names, cut from the
// same classes the card draws with — a reader matches a swatch to a bar in a
// glance and never reads a sentence describing a colour. The one sentence each
// card is allowed carries the thing no swatch can show: what decoupling
// measures, what acute:chronic compares, what a taper is for.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleQuestionMarkIcon } from "lucide-react";
import type { TranslationKey } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * What this app can explain — and deliberately not everything it draws.
 *
 * A `?` on every surface is furniture: it teaches the reader that the mark is
 * decoration and they stop looking at it. The run debrief has none, because a
 * route and a row of stats explain themselves.
 *
 * The rule for anything added here: it explains what is *on the card* and what
 * running idea sits behind it — never how this app works. A surface that needs
 * a `?` to explain its own UI has a UI problem instead.
 */
export type CardHelpId =
  "splits" | "volume" | "prediction" | "plan" | "goal" | "week";

/** One row: the mark itself, and the four or five words that name it. */
interface LegendRow {
  swatch: ReactNode;
  term: TranslationKey;
}

// The swatches are deliberately the card's own classes rather than an
// approximation of them. A legend that drifts from the chart is worse than no
// legend, because it is believed.
const BAR = "h-4 w-2.5 shrink-0 rounded-[2px]";
const COLUMN = "h-4 w-2.5 shrink-0 rounded-t-[4px]";
const MARK = "h-2 w-5 shrink-0 rounded-[2px]";
const TILE = "size-4 shrink-0 rounded-[4px] border";
/** The 3px rule beside a card's closing sentence — see `Callout`. */
const RULE = "h-4 w-[3px] shrink-0 rounded-full";

const HELP: Record<
  CardHelpId,
  { title: TranslationKey; rows: LegendRow[]; note?: TranslationKey }
> = {
  week: {
    title: "help.week.title",
    rows: [
      { swatch: <span className={`${BAR} bg-brand`} />, term: "help.week.ran" },
      {
        swatch: (
          <span
            className={`${BAR} border-muted-foreground/55 bg-muted/50 border border-dashed`}
          />
        ),
        term: "help.week.todo",
      },
      {
        swatch: (
          <span
            className={`${BAR} border-chart-5/70 bg-chart-5/10 border border-dashed`}
          />
        ),
        term: "help.week.missed",
      },
    ],
    note: "help.week.note",
  },
  goal: {
    title: "help.goal.title",
    rows: [
      {
        swatch: <span className={`${MARK} bg-brand/25`} />,
        term: "help.goal.week",
      },
      {
        swatch: <span className={`${MARK} bg-brand`} />,
        term: "help.goal.taper",
      },
    ],
    note: "help.goal.note",
  },
  splits: {
    title: "help.splits.title",
    rows: [
      {
        swatch: <span className={`${COLUMN} bg-brand`} />,
        term: "help.splits.normal",
      },
      {
        swatch: <span className={`${COLUMN} bg-chart-3`} />,
        term: "help.splits.slow",
      },
      {
        swatch: <span className="bg-chart-3 h-0.5 w-5 shrink-0 rounded-full" />,
        term: "help.splits.hr",
      },
    ],
    note: "help.splits.note",
  },
  volume: {
    title: "help.volume.title",
    rows: [
      {
        swatch: <span className={`${COLUMN} bg-brand`} />,
        term: "help.volume.normal",
      },
      {
        swatch: <span className={`${COLUMN} bg-chart-3`} />,
        term: "help.volume.spike",
      },
    ],
    note: "help.volume.note",
  },
  prediction: {
    title: "help.prediction.title",
    rows: [
      {
        swatch: (
          <span className="text-brand text-mono-badge font-mono font-semibold">
            PR
          </span>
        ),
        term: "help.prediction.pr",
      },
      {
        swatch: <span className={`${MARK} bg-brand`} />,
        term: "help.prediction.target",
      },
      {
        swatch: <span className={`${RULE} bg-chart-5`} />,
        term: "help.prediction.behind",
      },
    ],
    note: "help.prediction.note",
  },
  plan: {
    title: "help.plan.title",
    rows: [
      {
        swatch: <span className={`${TILE} border-brand/45 bg-brand/10`} />,
        term: "help.plan.key",
      },
      {
        swatch: <span className={`${TILE} border-border`} />,
        term: "help.plan.other",
      },
    ],
    note: "help.plan.note",
  },
};

export function CardHelp({ id }: { id: CardHelpId }) {
  const { t } = useTranslation();
  const help = HELP[id];

  return (
    <Popover>
      {/* `icon-sm`, not `icon-xs`: the latter is a flat 32px, and button.tsx
          says why that is the half of the 44px rule that actually gets missed.
          All of this is read on a phone more than anywhere else. */}
      <PopoverTrigger
        render={
          <Button aria-label={t("help.label")} size="icon-sm" variant="ghost" />
        }
      >
        <CircleQuestionMarkIcon />
      </PopoverTrigger>
      {/* Aligned to the end so it opens under the `?` rather than centred on a
          card that may be 660px wide, and capped so it fits a phone. */}
      <PopoverContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
        <PopoverTitle>{t(help.title)}</PopoverTitle>
        <ul className="flex flex-col gap-2">
          {help.rows.map(({ swatch, term }) => (
            <li className="flex items-center gap-2.5" key={term}>
              {/* A fixed cell, so terms line up however wide the ink is. */}
              <span className="flex h-4 w-5 shrink-0 items-center justify-center">
                {swatch}
              </span>
              <span className="text-caption text-foreground">{t(term)}</span>
            </li>
          ))}
        </ul>
        {/* One sentence, and only for the thing a swatch cannot draw. */}
        {help.note ? (
          <PopoverDescription className="border-border border-t pt-2.5">
            {t(help.note)}
          </PopoverDescription>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
