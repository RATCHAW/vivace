import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, FilmIcon, Loader2Icon } from "lucide-react";
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
 * The render panel under the player: kick off a Remotion Lambda render, watch
 * its progress live (SSE), download the MP4 once it exists. Everything shown
 * here is the persisted render state — reloading mid-render resumes the
 * progress bar, and an already-rendered run goes straight to download.
 *
 * `showAvatar` is the option the film in the player is playing with, and it
 * travels with the render request. A finished render made with a different
 * answer is a different video, so the panel offers that one for download and
 * this one to render, rather than passing the old MP4 off as the new choice.
 */
export function RenderControls({ run, showAvatar }: { run: Run; showAvatar: boolean }) {
  const queryClient = useQueryClient();
  // On unless PostHog says otherwise, so no key (or no flag) changes nothing.
  const renderEnabled = useFeatureFlag(RENDER_FLAG, true);
  const path = { id: String(run.id) } as const;
  const { data, error: loadError } = useQuery(getRunRenderOptions({ path }));
  const render = data?.render ?? null;
  const stale = render != null && render.show_avatar !== showAvatar;

  const start = useMutation({
    ...startRunRenderMutation(),
    // The generated mutation carries no key; this is what names the operation
    // when the failure reaches the MutationCache logger in @/lib/query-client.
    mutationKey: ["startRunRender"],
    onSuccess: (state) =>
      queryClient.setQueryData(getRunRenderQueryKey({ path }), state),
  });

  // While a render is in flight, the SSE stream is the source of truth; every
  // message lands in the same query cache the panel reads from.
  useEffect(() => {
    if (render?.status !== "rendering") return;
    return subscribeRunRenderProgress(run.id, (next) =>
      queryClient.setQueryData<RunRenderState>(
        getRunRenderQueryKey({ path: { id: String(run.id) } }),
        { render: next },
      ),
    );
  }, [run.id, render?.status, queryClient]);

  if (loadError) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTitle>Could not load the render state</AlertTitle>
        <AlertDescription>{loadError.error}</AlertDescription>
      </Alert>
    );
  }

  if (render?.status === "rendering") {
    return (
      <Progress
        className="mt-5 px-1"
        value={Math.round(render.progress * 100)}
        aria-label="Video render progress"
      >
        <ProgressLabel>Rendering video…</ProgressLabel>
        <ProgressValue />
      </Progress>
    );
  }

  const download = render?.status === "done" ? render.output_url : null;

  if (download && !stale) {
    // The video on file is the one the player is showing.
    return (
      <Button
        className="mt-4 w-full"
        onClick={() => trackEvent("ui.video_downloaded", { activityId: run.id })}
        render={<a href={download} download />}
      >
        <DownloadIcon />
        Download video
      </Button>
    );
  }

  const failure = start.error?.error ?? (render?.status === "error" ? render.error : null);
  // Past that return, a finished render can only be one made with the other
  // options — a file worth keeping hold of, but not the film in the player.
  const previous = stale ? download : null;

  // Already-rendered videos keep their download above; only new renders stop.
  if (!renderEnabled) {
    return (
      <p className="text-caption text-muted-foreground mt-4 text-center">
        Video rendering is paused right now. Check back shortly.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {failure && (
        <Alert variant="destructive">
          <AlertTitle>Render failed</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      {previous && (
        <p className="text-caption text-muted-foreground">
          Your last video was rendered with{" "}
          {render?.show_avatar ? "your avatar" : "the plain dot"}.
        </p>
      )}
      <Button
        className="w-full"
        disabled={data === undefined || start.isPending}
        onClick={() => {
          trackEvent("ui.render_clicked", {
            activityId: run.id,
            retry: render?.status === "error",
            showAvatar,
          });
          start.mutate({ path, body: { show_avatar: showAvatar } });
        }}
      >
        {start.isPending ? <Loader2Icon className="animate-spin" /> : <FilmIcon />}
        {render?.status === "error"
          ? "Retry render"
          : previous
            ? "Render again"
            : "Render video"}
      </Button>
      {/* Rendering replaces the stored file, so the one that already exists is
          offered while it is still there. */}
      {previous && (
        <Button
          variant="subtle"
          className="w-full"
          onClick={() => trackEvent("ui.video_downloaded", { activityId: run.id })}
          render={<a href={previous} download />}
        >
          <DownloadIcon />
          Download the last video
        </Button>
      )}
    </div>
  );
}
