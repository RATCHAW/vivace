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
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";

/**
 * The render panel under the player: kick off a Remotion Lambda render, watch
 * its progress live (SSE), download the MP4 once it exists. Everything shown
 * here is the persisted render state — reloading mid-render resumes the
 * progress bar, and an already-rendered run goes straight to download.
 */
export function RenderControls({ run }: { run: Run }) {
  const queryClient = useQueryClient();
  const path = { id: String(run.id) } as const;
  const { data, error: loadError } = useQuery(getRunRenderOptions({ path }));
  const render = data?.render ?? null;

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

  if (render?.status === "done" && render.output_url) {
    return (
      <Button
        className="mt-4 w-full"
        onClick={() => trackEvent("ui.video_downloaded", { activityId: run.id })}
        render={<a href={render.output_url} download />}
      >
        <DownloadIcon />
        Download video
      </Button>
    );
  }

  const failure = start.error?.error ?? (render?.status === "error" ? render.error : null);

  return (
    <div className="mt-4 flex flex-col gap-3">
      {failure && (
        <Alert variant="destructive">
          <AlertTitle>Render failed</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <Button
        className="w-full"
        disabled={data === undefined || start.isPending}
        onClick={() => {
          trackEvent("ui.render_clicked", {
            activityId: run.id,
            retry: render?.status === "error",
          });
          start.mutate({ path });
        }}
      >
        {start.isPending ? <Loader2Icon className="animate-spin" /> : <FilmIcon />}
        {render?.status === "error" ? "Retry render" : "Render video"}
      </Button>
    </div>
  );
}
