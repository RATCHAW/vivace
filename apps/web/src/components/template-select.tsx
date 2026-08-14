import { useTranslation } from "react-i18next";
import {
  templateEligibilities,
  VIDEO_TEMPLATES,
  type TemplateId,
  type TemplateInput,
} from "@repo/video";
import { useVideoLabels } from "@/i18n/video";
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
      }));

  return (
    <Select
      value={template}
      onValueChange={(next) => onChange(next as TemplateId)}
    >
      <SelectTrigger
        aria-label={t("videoOptions.templateSelect")}
        className="max-w-full"
      >
        <SelectValue>{labels.templateLabel(template)}</SelectValue>
      </SelectTrigger>
      {/* Anchored under the trigger rather than over it: the list is taller than
          the control and each row carries a line of explanation. */}
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="max-w-[360px]"
      >
        {verdicts.map((entry) => (
          <SelectItem
            key={entry.id}
            value={entry.id}
            disabled={!entry.eligible}
            className="items-start py-2.5"
          >
            <span className="flex flex-col gap-1">
              <span className="font-semibold">
                {labels.templateLabel(entry.id)}
              </span>
              <span className="text-caption text-muted-foreground text-wrap">
                {labels.eligibilityReason(entry) ??
                  labels.templateDescription(entry.id)}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
