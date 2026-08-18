// `pnpm dev:fake` — the whole app, running against a Strava you own.
//
// The end-to-end suite already stands up three real servers around a fake
// Strava; this is the same stack with nobody driving it, so you can sign in as
// two athletes in two windows and click through a feature that needs both of
// them. Some things cannot be tested any other way: this repository's Strava app
// is in Single Player Mode, so a second real account cannot authorise it at all,
// and even with an access increase a two-runner feature would need a friend to
// go for a run before you could check a layout.
//
// What is fake is *only Strava's address* — `STRAVA_API_BASE_URL` and
// `STRAVA_OAUTH_BASE_URL`. The OAuth plugin, the generated SDK, the routes, the
// migrations and the React app are the ones that ship, and the database is a
// real Postgres this stack migrates on boot the way production does.
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ATHLETES } from "./athletes.js";
import { DEV } from "./env.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WEB_DIR = fileURLToPath(new URL("../web", import.meta.url));
const E2E_DIR = fileURLToPath(new URL(".", import.meta.url));

/**
 * The stack sets `STRAVA_*_BASE_URL`, which is an exfiltration vector anywhere
 * an athlete's real token could reach it. Both are inert when NODE_ENV says
 * production — this is the belt to that pair of braces.
 */
if (
  process.env.NODE_ENV === "production" ||
  process.env.APP_ENV === "production"
) {
  throw new Error(
    "dev:fake points Strava at a server on this machine. It refuses to run " +
      "with NODE_ENV or APP_ENV set to production.",
  );
}

/**
 * Environment the API is allowed to keep from the shell and its own `.env`.
 *
 * Everything else is the stack's — a leftover DATABASE_URL or STRAVA_CLIENT_ID
 * would be read before the fake's, and the failure would look like the fake
 * being broken. These are the ones that make the *video* work, and none of them
 * has anything to say about which Strava is being talked to.
 */
const PASSED_THROUGH = [
  "MAPBOX_TOKEN",
  "REMOTION_AWS_REGION",
  "REMOTION_FUNCTION_NAME",
  "REMOTION_SERVE_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_PROFILE",
  "AWS_REGION",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

function passedThrough(): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of PASSED_THROUGH) {
    const value = process.env[name];
    if (value) kept[name] = value;
  }
  return kept;
}

/** `VITE_MAPBOX_TOKEN` as Vite will read it, without pulling in dotenv for one
 *  string. Vite's own precedence: `.env.local` over `.env`. */
function webMapboxToken(): string | null {
  for (const file of [".env.local", ".env"]) {
    let text: string;
    try {
      text = readFileSync(
        fileURLToPath(new URL(`../web/${file}`, import.meta.url)),
        "utf8",
      );
    } catch {
      continue;
    }
    const found = /^\s*VITE_MAPBOX_TOKEN\s*=\s*(.+?)\s*$/m.exec(text);
    if (found) return found[1].replace(/^["']|["']$/g, "") || null;
  }
  return null;
}

/**
 * Mapbox tokens carry a URL allow-list, and the one in apps/web/.env is almost
 * certainly scoped to the *development* origin — this stack serves on another
 * port.
 *
 * The failure that causes is a bad one to debug: the style loads, so the map
 * mounts and stamps its logo on the plate, and then every tile 403s and the map
 * frequently never reaches `load` — so the route layers are never added either.
 * What you get is a film whose type, numbers and bars are all correct over a
 * black rectangle, which reads as a broken template rather than as a token. One
 * request up front is cheaper than the afternoon.
 */
async function warnIfMapboxRefusesUs(): Promise<void> {
  const token = webMapboxToken();
  if (!token) return;
  try {
    // Any tile will do. This one is over the loop the fixture runs.
    const response = await fetch(
      "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/16/31389/26273" +
        `.vector.pbf?access_token=${token}`,
      { headers: { Referer: `${DEV.webUrl}/` } },
    );
    if (response.status !== 403) return;
  } catch {
    // Offline. The composition falls back to the bare canvas plate either way,
    // and a warning about a network that isn't there helps nobody.
    return;
  }
  process.stderr.write(
    [
      "",
      "  ! Mapbox is refusing this origin, so the map templates will draw on a",
      "    black plate. The token in apps/web/.env is restricted by URL, and",
      `    ${DEV.webUrl} is not on its list.`,
      "",
      "    Add it at https://console.mapbox.com/account/access-tokens/ , or",
      "    unset VITE_MAPBOX_TOKEN to get the bare canvas plate deliberately.",
      "",
    ].join("\n"),
  );
}

/** Refuses to start rather than sign you into a database that isn't there. */
async function waitForPostgres(): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new pg.Client({ connectionString: DEV.databaseUrl });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(
    `No Postgres at ${DEV.databaseUrl} after 30s. Start it with:\n` +
      `  pnpm dev:fake:db\n` +
      `Last error: ${String(lastError)}`,
  );
}

const children: ChildProcess[] = [];
let stopping = false;

/** One child, with its output labelled so three servers in one terminal can be
 *  told apart. */
function start(
  label: string,
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string> },
): ChildProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = (stream: NodeJS.ReadableStream, to: NodeJS.WriteStream) => {
    let rest = "";
    stream.on("data", (chunk: Buffer) => {
      const lines = (rest + chunk.toString()).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) to.write(`[${label}] ${line}\n`);
    });
  };
  prefix(child.stdout!, process.stdout);
  prefix(child.stderr!, process.stderr);

  child.on("exit", (code) => {
    if (stopping) return;
    process.stderr.write(`[${label}] exited (${code}); stopping the stack\n`);
    stop(code ?? 1);
  });

  children.push(child);
  return child;
}

function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  // Long enough for a watcher to put the terminal back the way it found it.
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

/** Polls a URL until it answers, so the banner below is printed once the stack
 *  is actually usable rather than once it has been asked to start. */
async function waitForHttp(url: string, what: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (stopping) return;
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet. The deadline is the only thing that gives up.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${what} never came up at ${url}`);
}

await waitForPostgres();
await warnIfMapboxRefusesUs();

start("strava", "pnpm", ["exec", "tsx", "fake-strava.ts"], {
  cwd: E2E_DIR,
  env: { FAKE_STRAVA_PORT: String(DEV.fakeStravaPort) },
});
await waitForHttp(`${DEV.fakeStravaUrl}/health`, "The fake Strava");

// `dev`, not `start`: this is a stack you keep open while changing the code it
// is running, and the API applies pending migrations itself at boot.
start("api", "pnpm", ["--filter", "@repo/api", "dev"], {
  cwd: ROOT,
  env: { ...passedThrough(), ...DEV.apiEnv },
});
await waitForHttp(`${DEV.apiUrl}/health`, "The API");

// Vite directly rather than through `pnpm --filter … dev`, which needs a `--` to
// forward arguments and then hands Vite the `--` as well — so the port is
// ignored and the server quietly drifts to the next free one. `--strictPort` is
// what turns that drift into a failure. `--host 127.0.0.1` because Vite
// otherwise binds `localhost`, which on macOS resolves to ::1 first — and then
// every address in this stack is IPv4 except the one you point a browser at.
start(
  "web",
  "pnpm",
  [
    "exec",
    "vite",
    "--port",
    String(DEV.webPort),
    "--strictPort",
    "--host",
    "127.0.0.1",
  ],
  { cwd: WEB_DIR, env: { API_URL: DEV.apiUrl } },
);
await waitForHttp(DEV.webUrl, "The web app");

const [ayoub, sam] = Object.values(ATHLETES);
process.stdout.write(
  [
    "",
    "  Vivace, against a Strava this machine owns.",
    "",
    `    app          ${DEV.webUrl}`,
    `    api          ${DEV.apiUrl}`,
    `    fake strava  ${DEV.fakeStravaUrl}`,
    `    database     ${DEV.databaseUrl}`,
    "",
    `  Sign in as ${ayoub.firstname} in one window and ${sam.firstname} in a private one —`,
    "  Strava's consent screen is two buttons, and which you click is who you are.",
    `  They ran ${ayoub.runs[0].name} together, thirty seconds apart.`,
    "",
    "  Ctrl-C stops all three.",
    "",
  ].join("\n"),
);
