import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import type { TemplateId, ThemeName } from "@repo/video";
import {
  getRunRenderOptions,
  getRunRenderQueryKey,
  startRunRenderMutation,
  subscribeRunRenderProgress,
  type Run,
  type RunRenderState,
} from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/logger";
import { useFeatureFlag } from "@/lib/posthog";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";

/**
 * The PostHog flag that can switch rendering off without a deploy — the API
 * checks the same one, and is what actually enforces it. Rendering is a Lambda
 * invocation per click, so it is the one thing here worth a kill switch.
 */
const RENDER_FLAG = "video-render";

/**
 * The foot of the video options panel: one button that says *Download video*
 * whatever state the render is in. Rendering is our problem, not the athlete's
 * — they asked for the file, so a run with no MP4 yet starts a Lambda render
 * under the same label and the panel spends the wait saying it is preparing the
 * video rather than naming the machinery. Everything shown here is the
 * persisted render state, so reloading mid-render resumes the progress bar and
 * an already-rendered run downloads on the first click.
 *
 * It draws no margin of its own — `<RunStudio>` owns the box it sits in, and on
 * a phone that box is a sheet whose bottom edge is the render button.
 *
 * `template`, `showAvatar` and `theme` are what the film in the player is
 * playing, and they travel with the render request. A run holds one render per
 * template, so switching template swaps which one this panel is about rather
 * than replacing it; within a template, a finished render made with a different
 * answer is a different video, so the same button renders that answer instead
 * of passing the old MP4 off as the new choice. Changing an option therefore
 * never adds a second button — it only changes what the one button has to do
 * before the file exists.
 */
export function RenderControls({
  run,
  template,
  showAvatar,
  theme,
}: {
  run: Run;
  template: TemplateId;
  showAvatar: boolean;
  theme: ThemeName;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // On unless PostHog says otherwise, so no key (or no flag) changes nothing.
  const renderEnabled = useFeatureFlag(RENDER_FLAG, true);
  const path = { id: String(run.id) } as const;
  const query = { template } as const;
  const { data, error: loadError } = useQuery(
    getRunRenderOptions({ path, query }),
  );
  const render = data?.render ?? null;
  // Every option the render was started with is part of what it *is*: a stored
  // film made with another answer is a different video, not this one.
  const stale =
    render != null &&
    (render.show_avatar !== showAvatar || render.theme !== theme);

  const start = useMutation({
    ...startRunRenderMutation(),
    // The generated mutation carries no key; this is what names the operation
    // when the failure reaches the MutationCache logger in @/lib/query-client.
    mutationKey: ["startRunRender"],
    onSuccess: (state) =>
      queryClient.setQueryData(getRunRenderQueryKey({ path, query }), state),
  });

  // While a render is in flight, the SSE stream is the source of truth; every
  // message lands in the same query cache the panel reads from.
  useEffect(() => {
    if (render?.status !== "rendering") return;
    return subscribeRunRenderProgress(run.id, template, (next) =>
      queryClient.setQueryData<RunRenderState>(
        getRunRenderQueryKey({
          path: { id: String(run.id) },
          query: { template },
        }),
        { render: next },
      ),
    );
  }, [run.id, template, render?.status, queryClient]);

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("render.loadErrorTitle")}</AlertTitle>
        <AlertDescription>{loadError.error}</AlertDescription>
      </Alert>
    );
  }

  if (render?.status === "rendering") {
    return (
      <Progress
        className="px-1"
        value={Math.round(render.progress * 100)}
        aria-label={t("render.progressLabel")}
      >
        <ProgressLabel>{t("render.preparing")}</ProgressLabel>
        <ProgressValue />
      </Progress>
    );
  }

  // Only a finished render made with the options in force is this video; one
  // made with another answer is a file for a film nobody is looking at, so it
  // is not offered — the button below renders the current answer instead.
  const download =
    render?.status === "done" && !stale ? render.output_url : null;

  if (download) {
    // The video on file is the one the player is showing.
    return (
      <Button
        className="w-full"
        onClick={() =>
          trackEvent("ui.video_downloaded", { activityId: run.id })
        }
        render={<a href={download} download />}
      >
        <DownloadIcon />
        {t("render.downloadVideo")}
      </Button>
    );
  }

  const failure =
    start.error?.error ?? (render?.status === "error" ? render.error : null);

  // Already-rendered videos keep their download above; only new renders stop.
  if (!renderEnabled) {
    return (
      <p className="text-caption text-muted-foreground text-center">
        {t("render.paused")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {failure && (
        <Alert variant="destructive">
          <AlertTitle>{t("render.failedTitle")}</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <Button
        className="w-full"
        disabled={data === undefined || start.isPending}
        onClick={() => {
          trackEvent("ui.render_clicked", {
            activityId: run.id,
            template,
            retry: render?.status === "error",
            showAvatar,
            theme,
          });
          start.mutate({
            path,
            body: { template, show_avatar: showAvatar, theme },
          });
        }}
      >
        {start.isPending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <DownloadIcon />
        )}
        {/* One label for "there is no file yet" and "the file on disk was cut
            with other options": both are a download that has to be made first,
            and the athlete asked for the same thing either way. A failure is
            the one case that has to admit something went wrong. */}
        {render?.status === "error"
          ? t("render.retry")
          : t("render.downloadVideo")}
      </Button>
    </div>
  );
}
