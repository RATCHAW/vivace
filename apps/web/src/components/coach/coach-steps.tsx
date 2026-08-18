// What the coach did before it answered, folded away once it has.
//
// While a turn is running, every step it takes is worth a line — a tool reading
// Strava can be silent for seconds, and the lines are the only proof anything
// is happening. The moment the answer lands they stop being progress and start
// being clutter: four mono chips above two sentences, in every message, forever.
//
// So they collapse into one. Not hidden — a turn the athlete wants to check is
// one tap away, and the count is what tells them there is something to check.
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon } from "lucide-react";
import { MonoLabel } from "@/components/mono";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface CoachStepsProps {
  /** How many steps are inside, for the row that stands in for them. */
  count: number;
  children: ReactNode;
}

export function CoachSteps({ count, children }: CoachStepsProps) {
  const { t } = useTranslation();

  return (
    <Collapsible>
      <CollapsibleTrigger className="group/steps text-stone hover:text-muted-foreground focus-visible:ring-ring/50 -mx-1.5 flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 outline-none transition-colors focus-visible:ring-3">
        {/* A quarter turn, not a flip: the chevron points at the row it opens,
            and 150ms is the same beat as the panel it belongs to. */}
        <ChevronRightIcon className="size-3 transition-transform duration-150 ease-out group-data-[panel-open]/steps:rotate-90" />
        <MonoLabel className="text-mono-badge text-inherit">
          {t("coach.steps", { count })}
        </MonoLabel>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 outline-none duration-150 ease-out">
        <div className="flex flex-col gap-2 pt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
