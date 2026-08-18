import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DownloadIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
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
 * Where this is drawn, and therefore how much room it has to say things in.
 *
 * `"panel"` is the foot of the video options card: a full-width pill under the
 * switches that made the film, with the progress bar and any failure in the
 * same column.
 *
 * `"tile"` is one cell of the studio's action grid on a phone, beside Share,
 * Coach and Options — an icon, and nothing else. It is exactly one cell and
 * never grows: the grid is measured off the film, and the film is measured off
 * the height the grid leaves, so anything that made this taller would take a
 * slice out of the picture and then re-wrap itself in the narrower row it had
 * just caused. So the progress the panel spells out becomes a rule along the
 * bottom edge of the pill, and a failure — a sentence, with nowhere in a 48px
 * square to put it — is said once as a toast, leaving the tile to carry the
 * standing half of the message by turning into a retry.
 */
type RenderLayout = "panel" | "tile";

/**
 * One button that says *Download video* whatever state the render is in.
 *
 * Rendering is our problem, not the athlete's — they asked for the file, so a
 * run with no MP4 yet starts a Lambda render under the same label and spends the
 * wait saying it is preparing the video rather than naming the machinery.
 * Everything shown here is the persisted render state, so reloading mid-render
 * resumes the progress and an already-rendered run downloads on the first click.
 *
 * It draws no margin of its own — `<RunStudio>` owns the box it sits in.
 *
 * `template`, `showAvatar`, `theme` and `greenscreen` are what the film in the
 * player is playing, and they travel with the render request. A run holds one
 * render per template, so switching template swaps which one this is about rather
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
  greenscreen,
  layout = "panel",
  blocked = null,
}: {
  run: Run;
  template: TemplateId;
  showAvatar: boolean;
  theme: ThemeName;
  greenscreen: boolean;
  layout?: RenderLayout;
  /**
   * Why no new render can be started, in the athlete's own words — the duo cut
   * with nobody in the other lane, which the API refuses with a 409. Said here
   * rather than let the click go and come back a failure. It reads exactly like
   * the kill switch below, because from where the athlete is sitting it is the
   * same thing: the button is not available, and a film already on disk is
   * still theirs to download.
   */
  blocked?: string | null;
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
    (render.show_avatar !== showAvatar ||
      render.theme !== theme ||
      render.greenscreen !== greenscreen);

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

  // The state both layouts read, resolved once — they differ in how much room
  // they have to describe it, never in what they think is true.
  const progress = render?.status === "rendering" ? render.progress : null;
  // Only a finished render made with the options in force is this video; one
  // made with another answer is a file for a film nobody is looking at, so it
  // is not offered — the button below renders the current answer instead.
  const download =
    render?.status === "done" && !stale ? render.output_url : null;
  const failure =
    start.error?.error ?? (render?.status === "error" ? render.error : null);
  // Why nothing new may be rendered, if anything says so — the film's own
  // missing pieces first, then our kill switch.
  const halt = blocked ?? (renderEnabled ? null : t("render.paused"));
  // Already-rendered videos keep their download; only new renders stop.
  const paused = halt != null && download == null;
  // A finished render should fulfil the click that started it. Observing an
  // in-flight render arms the automatic download too, so a page reload while
  // Lambda is working still completes without asking for a second tap. A video
  // that was already done when this component mounted is deliberately not
  // downloaded out of the blue.
  const autoDownloadArmed = useRef(false);
  const observedRender = useRef<string | null>(null);
  const autoDownloadedAt = useRef<string | null>(null);

  const startRender = () => {
    autoDownloadArmed.current = true;
    trackEvent("ui.render_clicked", {
      activityId: run.id,
      template,
      retry: render?.status === "error",
      showAvatar,
      theme,
      greenscreen,
    });
    start.mutate({
      path,
      body: { template, show_avatar: showAvatar, theme, greenscreen },
    });
  };
  const noteDownload = () =>
    trackEvent("ui.video_downloaded", {
      activityId: run.id,
      automatic: false,
    });

  useEffect(() => {
    if (render?.status === "rendering") {
      if (observedRender.current !== render.created_at) {
        observedRender.current = render.created_at;
        autoDownloadArmed.current = !stale;
        return;
      }
      // Changing an option while Lambda is working makes that file a different
      // video from the one on screen. Do not download it later merely because
      // the athlete changes the option back.
      if (stale) autoDownloadArmed.current = false;
      return;
    }
    if ((render?.status === "error" && !start.isPending) || start.isError) {
      autoDownloadArmed.current = false;
      return;
    }
    if (
      !autoDownloadArmed.current ||
      download == null ||
      render?.status !== "done" ||
      autoDownloadedAt.current === render.updated_at
    )
      return;

    autoDownloadArmed.current = false;
    autoDownloadedAt.current = render.updated_at;

    // Use the same plain anchor as the manual button. The S3 response owns the
    // filename and attachment headers; creating it here simply supplies the
    // click the completed asynchronous render can no longer receive from the
    // original button press.
    const link = document.createElement("a");
    link.href = download;
    link.download = "";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();

    trackEvent("ui.video_downloaded", {
      activityId: run.id,
      automatic: true,
    });
  }, [
    download,
    render?.created_at,
    render?.status,
    render?.updated_at,
    run.id,
    stale,
    start.isError,
    start.isPending,
  ]);

  // The tile has no room for why a render failed, so the reason is spoken once,
  // when it changes. Held in a ref rather than state: this only ever decides
  // whether a sentence has already been said, and re-rendering to record that
  // would be a render nobody looks at.
  const spoken = useRef<string | null>(null);
  useEffect(() => {
    if (layout !== "tile" || failure == null) {
      spoken.current = failure;
      return;
    }
    if (spoken.current === failure) return;
    spoken.current = failure;
    toast.error(t("render.failedTitle"), { description: failure });
  }, [layout, failure, t]);

  if (layout === "tile") {
    // A retry is a different thing to ask for than a download, and here the icon
    // is the only word the button has.
    const retry = download == null && render?.status === "error";
    // One label, doing the work the panel spreads over a button, a progress bar
    // and an alert — it is the button's accessible name and the only name this
    // icon has.
    const label =
      loadError != null
        ? t("render.loadErrorTitle")
        : progress != null
          ? t("render.preparingPercent", {
              percent: Math.round(progress * 100),
            })
          : paused
            ? (halt ?? t("render.paused"))
            : retry
              ? t("render.retry")
              : t("render.downloadVideo");

    return (
      <>
        <Button
          size="icon-fill"
          aria-label={label}
          disabled={
            loadError != null ||
            paused ||
            progress != null ||
            (download == null && (data === undefined || start.isPending))
          }
          onClick={download ? noteDownload : startRender}
          nativeButton={download == null}
          render={download ? <a href={download} download /> : undefined}
        >
          {progress != null ? (
            <>
              <Loader2Icon className="animate-spin" />
              <span className="text-caption tabular-nums">
                {Math.round(progress * 100)}%
              </span>
            </>
          ) : start.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : retry ? (
            <RotateCcwIcon />
          ) : (
            <DownloadIcon />
          )}
        </Button>

        {progress != null && (
          // A phone needs more than a three-pixel mark inside one of four small
          // buttons. This track spans the full action rail without adding a row
          // that would squeeze the 9:16 film. The number remains in the button,
          // so both the amount and the direction of travel are clear.
          <span
            aria-hidden
            data-slot="render-progress"
            className="bg-muted pointer-events-none absolute inset-x-0 -bottom-2 h-1.5 overflow-hidden rounded-full"
          >
            {/* `scaleX` rather than width: SSE progress lands in steps, and a
                compositor transform glides between them without relayout. */}
            <span
              className="bg-brand block h-full origin-left transition-transform duration-500 ease-out"
              style={{ transform: `scaleX(${progress})` }}
            />
          </span>
        )}
      </>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("render.loadErrorTitle")}</AlertTitle>
        <AlertDescription>{loadError.error}</AlertDescription>
      </Alert>
    );
  }

  if (progress != null) {
    return (
      <Progress
        className="px-1"
        value={Math.round(progress * 100)}
        aria-label={t("render.progressLabel")}
      >
        <ProgressLabel>{t("render.preparing")}</ProgressLabel>
        <ProgressValue />
      </Progress>
    );
  }

  if (download) {
    // The video on file is the one the player is showing.
    return (
      <Button
        className="w-full"
        onClick={noteDownload}
        nativeButton={false}
        render={<a href={download} download />}
      >
        <DownloadIcon />
        {t("render.downloadVideo")}
      </Button>
    );
  }

  if (paused) {
    return (
      <p className="text-caption text-muted-foreground text-center">
        {halt ?? t("render.paused")}
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
        onClick={startRender}
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
