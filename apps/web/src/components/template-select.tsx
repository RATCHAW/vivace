import { useTranslation } from "react-i18next";
import {
  templateEligibilities,
  VIDEO_TEMPLATES,
  type TemplateId,
  type TemplateInput,
} from "@repo/video";
import { useVideoLabels } from "@/i18n/video";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Which cut of the run is playing — above the film, because it is the film's
 * own title rather than one of the options underneath it.
 *
 * A template this run can't have is listed and disabled with the reason in its
 * place, never hidden: an athlete on a treadmill should be able to see that the
 * route replay exists and understand in four words why this run can't have one.
 * A catalogue that changes length as you click down the list reads as a bug.
 *
 * One reason is not like the others. `needs-partner` says the run is fine and
 * nobody has accepted yet — the athlete can fix that from this screen, and
 * choosing the cut is how they get to the invitation, which the studio only
 * offers on a template with a second lane in it. So that row stays selectable
 * and keeps its second line; every other reason is a fact about the run that no
 * click from here can change, and those rows stay dead.
 *
 * That reason is the *only* second line here. The templates describe themselves
 * well enough by name, and a sentence under each of four rows turns a choice
 * into a page to read.
 */
export function TemplateSelect({
  template,
  onChange,
  input,
}: {
  template: TemplateId;
  onChange: (next: TemplateId) => void;
  /** The run and its streams — what decides which templates it can be cut with.
   *  Null while the streams are loading, or when they couldn't be read. */
  input: TemplateInput | null;
}) {
  const { t } = useTranslation();
  const labels = useVideoLabels();
  // Without the streams, offer everything: the render runs from the API's own
  // copy of the run, so a browser that couldn't fetch them is not evidence that
  // the run has none.
  const verdicts = input
    ? templateEligibilities(input)
    : VIDEO_TEMPLATES.map((entry) => ({
        id: entry.id,
        eligible: true,
        reason: undefined,
        reasonKey: undefined,
      }));

  return (
    <Select
      value={template}
      onValueChange={(next) => onChange(next as TemplateId)}
    >
      <SelectTrigger
        aria-label={t("videoOptions.templateSelect")}
        className="w-full"
      >
        <SelectValue>{labels.templateLabel(template)}</SelectValue>
      </SelectTrigger>
      {/* Anchored under the trigger rather than over it: a greyed row carries a
          second line saying why, so the list is taller than the control. */}
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="max-w-[360px]"
      >
        {verdicts.map((entry) => {
          // Only the ineligible ones say anything beyond their name. A line of
          // marketing under every row is noise in a list of four words.
          const reason = labels.eligibilityReason(entry);

          return (
            <SelectItem
              key={entry.id}
              value={entry.id}
              disabled={!entry.eligible && entry.reasonKey !== "needs-partner"}
              className={cn(reason && "items-start py-2.5")}
            >
              <span className="flex flex-col gap-1">
                <span className="font-semibold">
                  {labels.templateLabel(entry.id)}
                </span>
                {reason && (
                  <span className="text-caption text-muted-foreground text-wrap">
                    {reason}
                  </span>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
