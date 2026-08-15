"use client";

import { useEffect, useState } from "react";
import { MonoLabel } from "@/components/mono";
import { VivaceMark } from "@/components/vivace-mark";
import {
  buildRoute,
  CANVAS,
  LOOP_SECONDS,
  replayFrame,
  RUN_SUMMARY,
  START_PHASE,
} from "@/lib/replay";
import type { Copy } from "@/i18n/dictionaries";

/** The words on the plate. Everything else it draws is a number. */
export type ReplayCopy = Copy["hero"]["replay"];

// The route is deterministic, so it is built once for the module rather than
// per render — and the server and the client draw the same path.
const route = buildRoute();

/**
 * The product, playing. A 9:16 plate running the same three chapters the app
 * renders to MP4: the route drawing itself over the map, live metrics counting
 * up, then the summary card.
 *
 * DESIGN.md {component.product-mockup-band}: the asset carries its own depth.
 * No shadow, no glow — a hairline and a black plate.
 */
export function ReplayPhone({ copy }: { copy: ReplayCopy }) {
  const [t, setT] = useState(START_PHASE);

  useEffect(() => {
    // Reduced motion holds the frame the page was served with, which is a
    // mid-run one — the still says what the film says.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      // Clamped so a backgrounded tab resumes rather than jumping a chapter.
      const dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      setT((current) => (current + dt / LOOP_SECONDS) % 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const frame = replayFrame(t, route);

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className="bg-background relative aspect-[340/604] w-[340px] max-w-full overflow-hidden rounded-xl border"
        role="img"
        aria-label={copy.alt}
      >
        {/* Chapter 2 — the map and the line. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ opacity: frame.mapOpacity }}
        >
          {/* Graph paper, not a map tile: the plate reads as somewhere without
              pretending to be a specific city. Held at 40% so the ruling stays
              under the line rather than competing with it. */}
          <div className="absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(0deg,var(--border)_0_1px,transparent_1px_30px),repeating-linear-gradient(90deg,var(--border)_0_1px,transparent_1px_30px)]" />
          <svg
            viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
            className="absolute inset-0 block h-full w-full"
          >
            <path
              d={route.d}
              fill="none"
              className="stroke-foreground/10"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={route.d}
              fill="none"
              className="stroke-brand"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={frame.routeLength}
              strokeDashoffset={frame.routeOffset}
            />
            <circle
              cx={frame.dotX}
              cy={frame.dotY}
              r="7"
              className="fill-foreground stroke-background"
              strokeWidth="3"
            />
          </svg>
          {/* The type sits on black, not on the line. */}
          <div className="from-background/90 absolute inset-x-0 top-0 h-[31%] bg-gradient-to-b to-transparent" />
          <div className="from-background/95 absolute inset-x-0 bottom-0 h-[43%] bg-gradient-to-t to-transparent" />
        </div>

        {/* The live HUD. */}
        <div
          className="absolute inset-0 flex flex-col px-6 py-8"
          style={{ opacity: frame.hudOpacity }}
        >
          <MonoLabel className="text-muted-foreground">{copy.date}</MonoLabel>
          <span className="text-heading-md mt-2">{copy.title}</span>

          <div className="mt-auto flex items-baseline gap-2">
            <span className="text-display-lg font-semibold tabular-nums">
              {frame.live.distance}
            </span>
            <span className="text-body-md text-muted-foreground font-medium tracking-[0.08em]">
              KM
            </span>
          </div>
          <div className="bg-foreground/15 my-4 h-px" />
          <div className="grid grid-cols-3 gap-2.5">
            <Metric label={copy.time} value={frame.live.time} />
            <Metric label={copy.pace} value={frame.live.pace} />
            <Metric label={copy.bpm} value={frame.live.hr} />
          </div>
        </div>

        {/* Chapter 3 — the receipt. */}
        <div
          className="bg-background absolute inset-0 flex flex-col px-6 py-8"
          style={{ opacity: frame.summaryOpacity }}
        >
          <MonoLabel className="text-muted-foreground">
            {copy.summaryDate}
          </MonoLabel>
          <span className="text-heading-md mt-2.5">{copy.title}</span>
          <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-6">
            <Metric label={copy.distance} value={RUN_SUMMARY.distance} large />
            <Metric label={copy.time} value={RUN_SUMMARY.time} large />
            <Metric label={copy.pace} value={RUN_SUMMARY.pace} large />
            <Metric
              label={copy.elevation}
              value={RUN_SUMMARY.elevation}
              large
            />
          </div>
        </div>

        {/* The exported video carries this lockup through every frame. Keeping
            it persistent here makes the mockup an honest preview of the MP4. */}
        <div
          aria-hidden
          className="absolute top-7 right-6 flex items-center gap-1.5"
        >
          <VivaceMark className="text-brand size-3.5" />
          <span className="text-caption font-semibold -tracking-[0.01em]">
            vivace
          </span>
        </div>

        {/* Chapter bars — the same three-part cut on every replay. */}
        <div aria-hidden className="absolute inset-x-5 top-3.5 flex gap-1.5">
          {[
            frame.chapters.title,
            frame.chapters.route,
            frame.chapters.summary,
          ].map((width, i) => (
            <span
              key={i}
              className="bg-foreground/20 h-[3px] flex-1 overflow-hidden rounded-full"
            >
              <span className="bg-foreground block h-full" style={{ width }} />
            </span>
          ))}
        </div>
      </div>

      <MonoLabel>{copy.format}</MonoLabel>
    </div>
  );
}

function Metric({
  label,
  value,
  large,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <MonoLabel className="text-mono-badge text-foreground/64">
        {label}
      </MonoLabel>
      <span
        className={
          large
            ? "text-heading-lg font-semibold tabular-nums"
            : "text-heading-sm font-semibold tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
