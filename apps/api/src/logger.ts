// The one logger for the API. Every log line is JSON on stdout, and — when
// LOKI_URL is set — the same line is pushed to Grafana Loki, which is what the
// Grafana dashboards in ops/grafana read.
//
// Two rules keep the logs queryable:
//   1. Every line carries an `event` (a dotted, low-cardinality name such as
//      "http_request" or "render.started"). Dashboards filter on it; free-text
//      `msg` is for humans reading a single line.
//   2. Anything request-scoped is logged through `c.get("log")` (see
//      request-logger.ts), never through this module's logger directly, so the
//      line carries `requestId` and `userId` and can be correlated.
import "dotenv/config";
import {
  destination,
  multistream,
  pino,
  stdSerializers,
  type Logger,
  type StreamEntry,
} from "pino";
import pinoLoki from "pino-loki";
import pretty from "pino-pretty";

/** Vitest wants neither a reporter full of logs nor an open HTTP batcher. */
const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type LogLevel = (typeof LEVELS)[number];

const level = process.env.LOG_LEVEL ?? (isTest ? "silent" : "info");

/**
 * What each stream lets through. The logger's own threshold does the real
 * filtering — including "silent", which no stream level can express — so this
 * only has to avoid being stricter than it.
 */
const streamLevel: LogLevel = (LEVELS as readonly string[]).includes(level)
  ? (level as LogLevel)
  : "trace";

/** Distinguishes deployments in Loki — `{service="api", env="production"}`. */
const env = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";

/**
 * Field paths that must never reach a log sink. `redact` matches whole paths,
 * so both the shape our own code logs and the shape a serializer produces are
 * listed.
 */
const REDACTED = [
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "password",
  "secret",
  "token",
  "headers.cookie",
  "headers.authorization",
  "req.headers.cookie",
  "req.headers.authorization",
  "context.token",
  "context.accessToken",
];

/**
 * The Loki stream, kept so a shutdown can flush its batch instead of dropping
 * the last few seconds — which is exactly the window a crash lives in.
 */
let lokiStream: ReturnType<typeof pinoLoki> | null = null;

function buildStreams(): StreamEntry[] {
  // Human-readable in a terminal, one JSON object per line everywhere else —
  // Docker, CI and any log collector want the JSON.
  const usePretty = process.env.LOG_PRETTY
    ? process.env.LOG_PRETTY !== "false"
    : env !== "production" && process.stdout.isTTY;

  const streams: StreamEntry[] = [
    {
      level: streamLevel,
      stream: usePretty
        ? pretty({
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,service,env",
            messageFormat: "{event} — {msg}",
          })
        : // Synchronous: this app logs a handful of lines per request, and a
          // sync stdout can't lose the line that explains a crash.
          destination({ dest: 1, sync: true }),
    },
  ];

  if (process.env.LOKI_URL) {
    lokiStream = pinoLoki({
      host: process.env.LOKI_URL,
      // Grafana Cloud hands out a user id + API token; a local Loki needs none.
      ...(process.env.LOKI_USERNAME && process.env.LOKI_PASSWORD
        ? {
            basicAuth: {
              username: process.env.LOKI_USERNAME,
              password: process.env.LOKI_PASSWORD,
            },
          }
        : {}),
      // Loki indexes labels, so only ever put bounded-cardinality values here.
      // `event`, `route` and `userId` stay in the JSON body and are queried
      // with `| json | event="…"` — as labels they would explode the index.
      labels: { app: "vivace", service: "api", env },
      propsToLabels: ["level"],
      batching: { interval: 2, maxBufferSize: 10_000 },
      // A dropped batch is worth a stderr line: silent log loss is worse than
      // noise when Loki is down.
      silenceErrors: false,
    });
    streams.push({ level: streamLevel, stream: lokiStream });
  }

  return streams;
}

function createLogger(): Logger {
  const options = {
    level,
    base: { service: "api", env },
    // Ship the level as "info"/"error", not 30/50 — Loki filters on the string.
    //
    // This is also why the streams are composed here rather than handed to
    // `pino.transport()`: a worker-thread transport re-reads `level` from the
    // serialised line, where a string compares false against every threshold
    // and silently discards *everything*. `multistream` is given the numeric
    // level directly by pino, so the formatter is safe.
    formatters: { level: (label: string) => ({ level: label }) },
    redact: { paths: REDACTED, censor: "[redacted]" },
    serializers: { err: stdSerializers.err },
  };

  if (isTest) return pino(options);

  return pino(options, multistream(buildStreams()));
}

export const logger = createLogger();

/**
 * Crashes and dropped promises are the failures you most want in Grafana, and
 * the ones a bare Node process reports the worst. Log, flush, then let the
 * process die so the orchestrator restarts it.
 */
export function installProcessLogging(): void {
  process.on("uncaughtException", (err) => {
    logger.fatal({ event: "process.uncaught_exception", err }, err.message);
    void flushAndExit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.fatal({ event: "process.unhandled_rejection", err }, err.message);
    void flushAndExit(1);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      logger.info({ event: "process.shutdown", signal }, `Received ${signal}`);
      void flushAndExit(0);
    });
  }
}

async function flushAndExit(code: number): Promise<void> {
  // Ending the Loki stream runs its close hook, which pushes whatever is still
  // batched. Bounded, because exiting late is better than not exiting at all.
  const flushed = new Promise<void>((resolve) => {
    if (!lokiStream) return resolve();
    lokiStream.end(() => resolve());
  });
  await Promise.race([flushed, new Promise((r) => setTimeout(r, 2_000))]);
  process.exit(code);
}
