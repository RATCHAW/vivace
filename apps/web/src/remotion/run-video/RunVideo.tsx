import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { StravaActivity, StravaStreamSet } from "@repo/shared";
import {
  DRAW_END,
  DRAW_START,
  formatClock,
  formatKm,
  formatPace,
  formatStartDate,
  metricsAtProgress,
} from "./data";
import { RunMap } from "./RunMap";
import { RouteFallback } from "./RouteFallback";

export interface RunVideoProps {
  activity: StravaActivity;
  streams: StravaStreamSet;
  mapboxToken: string;
}

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

// Type ramp for the 1080×1920 story canvas. Sized for a phone held at arm's
// length: nothing informational below 30px.
const TYPE = {
  caption: 34,
  title: 84,
  hero: 176,
  heroUnit: 44,
  tileLabel: 30,
  tileValue: 72,
  tileUnit: 30,
  credit: 22,
} as const;

function MetricTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontSize: TYPE.tileLabel,
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.64)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: TYPE.tileValue,
          fontWeight: 600,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          color: "#ffffff",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function RunVideo({ activity, streams, mapboxToken }: RunVideoProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // One progress value drives the trace, the camera and the live numbers, so
  // the dot on the map and the metrics always agree.
  const progress = interpolate(frame, [DRAW_START, DRAW_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.25, 1),
  });

  const points = streams.latlng?.data ?? [];
  const hasRoute = points.length >= 2;
  const hasMap = hasRoute && mapboxToken !== "";
  const metrics = metricsAtProgress(activity, streams, progress);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        color: "#ffffff",
        fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
      }}
    >
      {hasMap ? (
        <RunMap
          points={points}
          progress={progress}
          token={mapboxToken}
          width={width}
          height={height}
        />
      ) : hasRoute ? (
        <RouteFallback points={points} progress={progress} width={width} height={height} />
      ) : null}

      {/* Scrims keep type legible over the map without breaking the
          no-drop-shadow rule — elevation via canvas luminance only. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 560,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.88), rgba(0,0,0,0))",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 780,
          background: "linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0))",
        }}
      />

      {/* Title band */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "104px 80px 0",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div
          style={{
            fontSize: TYPE.caption,
            fontWeight: 500,
            letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.72)",
            opacity: interpolate(frame, [0.5 * fps, 1.1 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easeOut,
            }),
          }}
        >
          {formatStartDate(activity)}
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: TYPE.title,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            textWrap: "balance",
            opacity: interpolate(frame, [0.2 * fps, 0.9 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easeOut,
            }),
            translate: `0px ${interpolate(frame, [0.2 * fps, 0.9 * fps], [36, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easeOut,
            })}px`,
          }}
        >
          {activity.name}
        </h1>
      </div>

      {/* Live metrics band */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "0 80px 108px",
          display: "flex",
          flexDirection: "column",
          opacity: interpolate(frame, [1.4 * fps, 2.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          }),
          translate: `0px ${interpolate(frame, [1.4 * fps, 2.1 * fps], [48, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          })}px`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <span
            style={{
              fontSize: TYPE.hero,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatKm(metrics.distanceMeters)}
          </span>
          <span
            style={{
              fontSize: TYPE.heroUnit,
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.72)",
            }}
          >
            KM
          </span>
        </div>

        {/* DESIGN.md hairline-dark divider, not a shadow */}
        <div
          style={{
            height: 1,
            backgroundColor: "rgba(255,255,255,0.16)",
            margin: "44px 0",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 32,
          }}
        >
          <MetricTile label="Time">{formatClock(metrics.elapsedSeconds)}</MetricTile>
          <MetricTile label="Pace">
            {formatPace(metrics.paceSecondsPerKm)}
            <span
              style={{
                fontSize: TYPE.tileUnit,
                fontWeight: 500,
                marginLeft: 10,
                color: "rgba(255,255,255,0.64)",
              }}
            >
              /KM
            </span>
          </MetricTile>
          {metrics.heartrate != null ? (
            <MetricTile label="Heart rate">
              {metrics.heartrate}
              <span
                style={{
                  fontSize: TYPE.tileUnit,
                  fontWeight: 500,
                  marginLeft: 10,
                  color: "rgba(255,255,255,0.64)",
                }}
              >
                BPM
              </span>
            </MetricTile>
          ) : (
            <MetricTile label="Elev gain">
              {Math.round(metrics.elevationGainMeters)}
              <span
                style={{
                  fontSize: TYPE.tileUnit,
                  fontWeight: 500,
                  marginLeft: 10,
                  color: "rgba(255,255,255,0.64)",
                }}
              >
                M
              </span>
            </MetricTile>
          )}
        </div>
      </div>

      {hasMap && (
        <div
          style={{
            position: "absolute",
            bottom: 26,
            right: 32,
            fontSize: TYPE.credit,
            color: "rgba(255,255,255,0.45)",
          }}
        >
          © Mapbox © OpenStreetMap
        </div>
      )}
    </AbsoluteFill>
  );
}
