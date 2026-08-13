# Repo conventions

Turborepo + pnpm workspaces. `apps/api` (Hono), `apps/web` (Vite + React),
`apps/landing` (Next.js marketing page), `packages/strava-api` (generated Strava
SDK), `packages/video` (Remotion templates). See [README](./README.md) for setup.

## API contract — generated, never hand-written

Three artifacts are produced by codegen and **committed**. Never edit them by hand;
run `pnpm generate` (root) after changing a route or schema.

| Artifact | Generated from | Consumed by |
| --- | --- | --- |
| `packages/strava-api/src/generated/` | `packages/strava-api/openapi/strava-swagger.json` | `apps/api` |
| `apps/api/openapi.json` | the Zod schemas + `createRoute()` calls in `apps/api/src` | `apps/web` codegen, Swagger UI |
| `apps/web/src/api/generated/` | `apps/api/openapi.json` | `apps/web` |

Consequences:

- **Adding or changing an endpoint is a three-step edit.** Schema in
  `apps/api/src/schemas.ts` → route in `apps/api/src/app.ts` → `pnpm generate`.
  A test fails if `openapi.json` drifts from the routes, so skipping the last step
  is caught, not shipped.
- **`z` comes from `@hono/zod-openapi`, not `zod`.** It's Zod extended with
  `.openapi()`; plain `zod` schemas won't carry metadata into the document.
  `.openapi("Name")` registers a named component — give it a name that isn't a JS
  global (`ApiError`, not `Error`, or the generated client shadows it).
- **Never talk to Strava with bare `fetch`.** Use the generated SDK:
  `getLoggedInAthlete({ client: createStravaClient(token) })`. All 32 endpoints are
  already typed. Strava's spec omits some live fields (`username`, `bio`), so widen
  the generated type where needed — see `apps/api/src/strava.ts`.
- **Never fetch our own API by hand from the browser.** Use the generated
  TanStack Query options: `useQuery(getStravaAthleteOptions())`. Import from
  `@/api` (the barrel that configures the client and normalises errors into
  `ApiRequestError`), never from `@/api/generated`.
- New queries need no provider work — `QueryClientProvider` is already in
  `src/main.tsx` with the client from `src/lib/query-client.ts`.

## Video — one catalogue, in packages/video

Every video is a template declared in `packages/video/src/registry.ts`. That file
is the source of truth for what can be rendered; apps/api, apps/web and the
Lambda bundle all read it rather than each holding their own list.

- **Adding a template touches three files, none of them in apps/api.** An entry
  in `registry.ts` → a component under `src/templates/` → a line in the two maps
  in `Root.tsx`. `registry.test.ts` fails if the halves drift. Then run
  `pnpm --filter @repo/video bundle:check` — webpack, not tsc, is what finds a
  bad import in the Lambda entry, and otherwise `deploySite` finds it for you.
- **`registry.ts` must stay React-free.** apps/api imports `@repo/video` for the
  catalogue, and its tsconfig has no `jsx` setting — a type-level reference to a
  `.tsx` file from there breaks the API's typecheck, which is the point. The
  components live behind `@repo/video/compositions`; the Lambda bundle enters at
  `./lambda-entry` and loads each template with `lazyComponent`.
- **A serve URL is a bundle, not a video.** One site holds every composition and
  `renderMediaOnLambda` picks one by `compositionId`. Don't reach for a second
  deployment to add a template — reach for `REMOTION_SERVE_URL_<TEMPLATE>` only
  when a template's dependencies are heavy enough that every *other* template
  shouldn't download them on a cold start.
- **The axis that costs money is the profile, not the URL.** `RENDER_PROFILES`
  declares memory, timeout, GL backend and frame budget; Lambda bills
  GB-seconds. A new template picks a profile, and the deploy script creates a
  function for it. Never hardcode `gl` or a timeout at a call site again.
- **The props contract is `VideoActivity` / `VideoStreams` in `types.ts`**, not
  `Run` from either app. Both apps' `Run` types are structurally assignable to
  it, which is what lets one composition serve the browser `<Player>`, the API
  and a headless Lambda render.
- **A render's identity is `renderPropsHash(template, options)`** — template plus
  what the athlete chose, and deliberately *not* the serve URL or the resolved
  input props. Adding an option means adding it to that hash, which is the
  decision to invalidate every stored video made without it.
- **A run holds one render per template** (`run_render`'s key is user + activity
  + template), so switching template must never discard the last one's MP4.
- The Vivace mark is copied into `packages/video/src/brand/` for the same reason
  apps/landing copies its primitives — nothing from apps/web exists on Lambda.
  `vivace-mark.test.tsx` in apps/web fails if the two paths drift.

## Logging — structured, never `console.log`

pino in `apps/api/src/logger.ts` → JSON on stdout, and to Grafana Loki when
`LOKI_URL` is set. Dashboards live in `ops/grafana/dashboards`; see the README
for how to run the stack.

- **Every line carries an `event`** — a dotted, low-cardinality name
  (`render.started`, `strava.request_failed`, `ui.page_view`). Dashboards group
  by it; ids and other variable values go in sibling fields, never in the name.
- **In a handler, log through `c.get("log")`, not `logger`.** The request child
  already carries `requestId` and — after `identify(c, userId)` — `userId`, which
  is what makes a line traceable. `logger` directly is for startup and shutdown.
- **`app.use("*", requestLogger)` is first in the chain** and emits exactly one
  `http_request` line per request, whatever the outcome. Don't log "handling X"
  at the top of a handler; that line already exists.
- **Never swallow an error silently.** A bare `catch {}` is the bug this whole
  setup exists to prevent — log it, even when recovery is correct (see the
  progress poll in `app.ts`).
- **New sensitive fields go in `REDACTED`** in `logger.ts`. Tokens must never
  reach a sink.
- **Don't add a `level` formatter anywhere else, or move the streams into
  `pino.transport()`.** A worker-thread transport re-reads `level` from the
  serialised line, where the string form compares false against every threshold
  and silently drops *all* output. `multistream` in the main thread is deliberate.

In the browser, `@/lib/logger` batches to `POST /api/logs`, which re-logs
server-side with `source: "web"`:

- `trackEvent("ui.…")` for a user action, `trackError("…", err)` for a failure.
  Errors flush immediately; actions flush on a timer and on page hide.
- **Failed API calls are already logged** by the `QueryCache`/`MutationCache`
  hooks in `@/lib/query-client` — don't add a `logError` to every `onError`.
- The event name is validated server-side against `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$`
  and the batch is capped, because the endpoint is deliberately unauthenticated
  (a crash on the sign-in page is exactly what it's for).
- `apps/landing` has no logging: it is a static marketing page and never calls
  the API. Keep it that way — PostHog is the exception, and it talks to PostHog
  directly rather than through us.

## Analytics — PostHog, behind the same call sites

PostHog is a *second sink* on the instrumentation that already exists, never a
parallel one. `apps/api/src/posthog.ts` and `apps/web/src/lib/posthog.ts` own
the SDKs; nothing else imports `posthog-js` or `posthog-node`.

- **Record a user action once.** `trackEvent(...)` in the browser and
  `track(c, ...)` in the API (`apps/api/src/analytics.ts`) each write a log line
  *and* a PostHog event. Never add a `posthog.capture` next to a `trackEvent` —
  that is exactly the drift these helpers exist to prevent.
- **Diagnostics stay out of PostHog.** `auth.unauthenticated`,
  `strava.request_failed`, `request.invalid`, a flaky poll — log those through
  `c.get("log")` directly. They describe the server, not the athlete, and in
  PostHog they are noise you pay to store.
- **Everything is a no-op without a key.** `POSTHOG_KEY` / `VITE_POSTHOG_KEY` /
  `NEXT_PUBLIC_POSTHOG_KEY` unset is the normal state of a fresh clone and of
  every test run. No feature may depend on PostHog being reachable.
- **A flag's fallback is the shipped behaviour.** `isFeatureEnabledFor(flag, id,
  fallback)` and `useFeatureFlag(flag, fallback)` return it when PostHog is off,
  unreachable, or has never heard of the flag. The server reads `getFlag()`, not
  `isEnabled()` — the latter reports an unknown flag as *off*, which would
  disable a feature the moment PostHog was switched on.
- **Don't reach for `withTracing`** from `@posthog/ai` — it throws on an AI SDK
  v7 model and demands an OpenTelemetry exporter. The coach sends
  `captureAiGeneration` from `streamText`'s `onFinish`, where the SDK already
  hands over tokens, latency and stop reason.
- **Coach transcripts stay private by default** (`privacyMode`), so
  `$ai_generation` carries the numbers and not the conversation. The opt-in is
  `POSTHOG_LLM_CAPTURE_CONTENT=true`.
- **Session replay is on.** Anything that identifies an athlete on screen gets
  `ph-no-capture`, which blocks it in replay *and* autocapture.

`apps/landing` is the one exception to "no instrumentation on the landing page":
it has no logging (it never calls the API), but it does load PostHog, because
the sign-up funnel starts there. One client component, `analytics.tsx`, and
autocapture handles the CTA clicks — so the CTAs stay Server Components.

## UI — always shadcn/ui

shadcn/ui is the default for anything user-facing. Before writing markup or CSS:

1. Check whether a [shadcn component](https://ui.shadcn.com/docs/components) covers it.
   If yes, install it — `pnpm --filter @repo/web ui:add <name>` — and use it.
2. Only compose new components out of the existing primitives in
   `apps/web/src/components/ui/` when the registry has no match.
3. Hand-rolled markup with bespoke CSS is the last resort.

## Design system — apps/web/DESIGN.md

[`apps/web/DESIGN.md`](./apps/web/DESIGN.md) is the visual source of truth. It is
bound to the shadcn token layer in `apps/web/src/styles.css` — every literal
there carries a comment naming the DESIGN.md token it implements. Change tokens
in `styles.css`, not in components.

The mapping:

| DESIGN.md | Where it lives |
| --- | --- |
| `colors.canvas-light` mode | `:root` (light theme) |
| `colors.canvas-dark` mode | `.dark` (dark theme) |
| `colors.primary` (cobalt) | `--brand` → `bg-brand`, **not** `--primary` |
| `button-primary` / `button-dark` | `--primary` (white on dark, black on light) |
| `typography.*` | `text-display-xl`, `text-heading-md`, `text-body-md`, `text-caption`, … |
| `rounded.*` | `rounded-sm` 8px · `rounded-md` 12px · `rounded-lg` 20px · `rounded-xl` 28px · `rounded-full` |
| `spacing.*` | Tailwind's 4px scale (`py-3.5` = 14px, `p-8` = 32px, `py-22` = 88px) |

Non-obvious consequences:

- **Cobalt is not `--primary`.** DESIGN.md reserves `colors.primary` for the
  featured card and the wordmark — at most one per viewport. The loud CTA is the
  white/black pill, which *is* `--primary`. Use `bg-brand` for the cobalt stamp.
- **Every button is a pill at ≥48px.** Don't reach for a smaller custom height.
- **No drop shadows anywhere.** Elevation is canvas + surface-luminance +
  hairlines. If you're adding `shadow-*`, you're off-system.
- **Accent colours are illustration-only** — never a button surface.
- **New `--text-*` or `--color-*` tokens must be registered in
  `src/lib/utils.ts`.** tailwind-merge otherwise reads `text-body-md` as a
  *colour* and silently drops `text-primary-foreground` when both land in one
  `cn()` call.

Rules:

- **Style with tokens, not literals.** `bg-card`, `text-muted-foreground`,
  `border-border`, `bg-muted/40`. Raw hex or `text-gray-500` breaks dark mode.
  Brand colours outside the token set get an `@theme` entry in
  `apps/web/src/styles.css` (see `--color-strava`).
- **Vendored components are editable.** Files under `src/components/ui/` are source,
  not a dependency — change them when a variant is needed everywhere. Prefer a new
  `cva` variant over a one-off `className` override that gets copy-pasted around.
- Import via the `@/` alias (`@/components/ui/button`), not relative paths.
- Primitives are [Base UI](https://base-ui.com), not Radix — check Base UI's docs when
  a component's props don't match a Radix-era tutorial.
- Icons: `lucide-react`. Dark mode: class-based via `next-themes`, provider in
  `src/main.tsx`.

## apps/landing — the marketing page, on its own

A separate Next.js App Router app. It is deliberately not part of `apps/web`: no
session, no generated API client, no router. It links to the app, it never calls it.

- **Nothing from `apps/web` is importable.** The two apps share a design language,
  not a module graph. `button.tsx`, `input.tsx`, `icons.tsx` and `wordmark.tsx` are
  copied in, and `apps/landing/src/styles.css` mirrors `apps/web/src/styles.css` —
  a token change belongs in **both** files.
- **Server Components by default.** Only `replay-phone.tsx` is `"use client"`,
  because it runs a `requestAnimationFrame` loop. Keep it that way: the page has to
  stay prerenderable.
- **The canvas switches by band, not by theme.** There is no `.dark` class and no
  theme toggle here. `:root` is `canvas-dark`; a white catalogue band opts into the
  light token set with `.band-light` (see the two `<section>`s that use it).
  Consequence: `dark:` variants never fire — style with tokens only.
- **Links out go through `src/lib/site.ts`.** `NEXT_PUBLIC_APP_URL` is inlined at
  build time, so it is a Docker build arg, not a runtime env var.
- Hero-replay maths lives in `src/lib/replay.ts` as pure functions of `t` and is
  unit-tested. Keep it pure — the server and the first client frame must agree, or
  React logs a hydration mismatch.

## Checks

`pnpm typecheck && pnpm test && pnpm build` must pass before a change is done.
