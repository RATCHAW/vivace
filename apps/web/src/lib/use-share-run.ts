import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Run } from "@/api";

/**
 * Hand this run's link to whatever the device shares with.
 *
 * A hook rather than a helper because both layouts of the studio offer it — the
 * wide one from the row under the film, the phone from the grid of actions —
 * and a share sheet that copied to the clipboard on one and not the other would
 * be two behaviours wearing one word.
 *
 * The link is the runs screen pointed at this activity, which is how the studio
 * is deep-linked everywhere else in the app: whoever opens it lands on the film,
 * not on the list.
 */
export function useShareRun(run: Pick<Run, "id" | "name">) {
  const { t } = useTranslation();

  return useCallback(async () => {
    const url = `${window.location.origin}/replays?run=${run.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: run.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success(t("player.linkCopied"), {
        description: t("player.linkCopiedBody"),
      });
    } catch (error) {
      // A dismissed share sheet rejects too — only surface real failures.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(t("player.shareFailed"));
    }
  }, [run.id, run.name, t]);
}
