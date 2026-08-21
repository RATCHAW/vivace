# Repo conventions

Turborepo + pnpm workspaces. `apps/api` (Hono), `apps/web` (Vite + React),
`apps/landing` (Next.js marketing page), `packages/strava-api` (generated Strava
SDK), `packages/video` (Remotion templates). See [README](./README.md) for setup.

Both front ends ship in English and French — no user-facing string is written
inline. See [Copy](#copy--english-and-french-never-inline).

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

- **Adding a template touches four files, none of them in apps/api.** An entry
  in `registry.ts` → a component under `src/templates/` → a line in the two maps
  in `Root.tsx` and in `VIDEO_COMPONENTS` → a rule in `eligibility.ts`. The
  eligibility map is `Record<TemplateId, …>`, so the compiler asks for that one;
  `registry.test.ts` fails if the other halves drift. Then run
  `pnpm --filter @repo/video bundle:check` — webpack, not tsc, is what finds a
  bad import in the Lambda entry, and otherwise `deploySite` finds it for you.
- **A template's shared parts live in `src/core/`** — the safe area and type
  ramp (`layout.ts`), the three themes (`theme.ts`), the formatters
  (`format.ts`), route cleaning and projection (`geo.ts`), beats and easing
  (`timing.ts`), and the `<Stage>`/numeral primitives. All of it is React-free
  except `Stage.tsx` and `numerals.tsx`, because apps/api reaches the first group
  through eligibility and duration.
- **Tabular numerals are mandatory** anywhere a number animates
  (`NUMERAL_STYLE`), and nothing informational sits outside `SAFE_TOP`…
  `SAFE_BOTTOM` — a story's own UI covers the rest. A template's layout maths is
  pure so the tests can assert both without rendering a frame.
- **A film's length is a property of the run, not of the catalogue.**
  `estimateDurationInFrames` is what `calculateMetadata` returns on Lambda and
  what sizes the browser's `<Player>`; the catalogue's `durationInFrames` is the
  fallback. Every template lays its beats out against the duration it was
  actually handed (`buildBeats(spans, fps, total)`), so it can never end on
  black. The ceiling is 15s — Instagram cuts a story segment there — and
  `run-video` predates it, has no estimator, and keeps its 20s.
- **Ineligible is shown, never hidden.** `templateEligibilities(input)` drives
  the picker: a treadmill run sees the route replay greyed with four words
  saying why. `minimal-numbers` must stay eligible for everything — it is what
  renders when a run has nothing.
- **A second runner is `needsPartner` on the catalogue entry, and nothing else.**
  That flag is what makes apps/api resolve the run's accepted invitation, read
  the other athlete's run with *their* Strava token (`loadRunPartner`), fold
  their activity id into `renderPropsHash` and refuse the render with a 409 when
  nobody has said yes. The eligibility rule tells the athlete so first, and
  `GET /api/runs/{id}/partner` is what the browser plays the film from — the
  `<Player>` cannot go to Strava for somebody else's run. The props contract is
  `VideoPartner`; the API's is snake_case `RunPartner`, and the crossing happens
  in `render.ts` and in `run-studio.tsx`, never in a composition.
- **The invitation is offered on the cuts that have a lane for it, and nowhere
  else.** Same flag: `InviteControls` is drawn only where `needsPartner` is
  true, so the studio stops asking a solo film to bring somebody. That makes the
  duo cut the only door to the invitation, which is why the picker keeps a
  template selectable when its only verdict is `needs-partner` — it plays with
  the second lane empty until somebody accepts, and the download is stopped with
  that same sentence rather than left to come back a 409. It also fixes the
  order of the duo rule: the route is checked *before* the partner, so
  `needs-partner` can only ever mean everything else about the run is fine.
- **Determinism is a feature, not a nicety.** Same input and options must give a
  byte-identical file, because `renderPropsHash` promises the athlete the stored
  MP4 *is* the film they just watched. Anything that wants to look random takes
  its numbers from `core/seed.ts`.
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
  decision to invalidate every stored video made without it. `theme` is in there
  with its default value omitted, which is how it was added without marking a
  single already-rendered film stale.
- **An option a template ignores is never stored as an answer.** `supportsAvatar`
  and `supportsTheme` on the catalogue entry are checked in the route, and the
  option is dropped before it reaches the hash — otherwise two identical films
  would hash differently and each get its own Lambda invocation.
- **The key plate is a delivery format, not a fourth look.** `greenscreen`
  (`core/greenscreen.ts`) renders the canvas in chroma green so the athlete can
  cut it out and put their own footage behind the run, and it composes with the
  theme rather than replacing it. Every template honours it — there is no
  `supportsGreenscreen` to check, and `registry.test.ts` fails on a template
  whose default props don't carry one. Three rules make a file keyable: the
  canvas is one flat colour, the grain is off (noise makes the matte crawl), and
  every ink is flattened over the canvas it was designed against, because a
  translucent white over the plate composites to pale green and is cut away with
  it. Anything drawn *as* the canvas — a marker's punched-out centre — uses
  `theme.plate`, or it keys out into a hole. The replay drops its basemap when
  the option is on: the map *is* that template's background, and replacing it is
  what the athlete asked for.
- **A run holds one render per template** (`run_render`'s key is user + activity
  + template), so switching template must never discard the last one's MP4.
- The Vivace mark is copied into `packages/video/src/brand/` for the same reason
  apps/landing copies its primitives — nothing from apps/web exists on Lambda.
  `vivace-mark.test.tsx` in apps/web fails if the two paths drift.

## Database — Drizzle, and one migration history for the whole schema

Postgres through [Drizzle](https://orm.drizzle.team). `apps/api/src/db/schema/`
is the source of truth; `apps/api/drizzle/` holds the generated SQL and is
**committed**. Nothing else in the repo talks to a database.

- **A schema change is two steps.** Edit `src/db/schema/*.ts` → `pnpm
  db:generate`. The migration file and the snapshot in `drizzle/meta` are part of
  the commit; `pnpm db:migrate` applies one by hand, and the API applies pending
  ones itself at boot (`src/db/migrate.ts`) before it binds the port.
- **`drizzle-kit push` is for scratch databases only.** It introspects and
  rewrites to match, which against production would rebuild indexes and rename
  every constraint the old bootstrap created. `generate` + `migrate` is the path
  that ships.
- **better-auth's four tables are ours now, and their columns are camelCase.**
  `user`, `session`, `account`, `verification` were created by better-auth's own
  Kysely adapter, which quoted its field names verbatim — so the live columns
  really are `"userId"` and `"createdAt"`. `pnpm --filter @repo/api auth:generate`
  emits **snake_case**; it writes to a gitignored scratch file precisely so it
  can't be pasted over `src/db/schema/auth.ts`. Read it to see what a plugin
  added, then add that field by hand. `src/db/schema.test.ts` fails if the column
  names drift or a better-auth field has no column.
- **A store never creates its own table.** Every table used to arrive through a
  `CREATE TABLE IF NOT EXISTS` on first use, with a tail of `ADD COLUMN IF NOT
  EXISTS` behind it. That is what the migration history replaces — a new column
  belongs in the schema, not in a store's warm-up path.
- **`predatesDrizzle`/`stampBaseline` in `src/db/migrate.ts` exist for databases
  that already existed.** 0000 describes them, so it is recorded as applied
  rather than run. Don't edit 0000: its sha256 is the row that says production is
  adopted, and changing the file orphans that row.
- **Migrations are append-only, one per pull request.** `scripts/check-new-migrations.sh`
  runs in CI and fails on either — an edited migration is never re-applied, so
  production would keep the old schema while the repo describes the new one.
  Two migrations in a branch means squashing: delete the generated files, revert
  `meta/_journal.json` and `meta/*_snapshot.json` to `origin/main`, and run
  `pnpm db:generate` once.
- **Our tables key on `user_id text` with no foreign key to `user`.** That is
  what the live data is. It's also why `db/seed.ts` seeds athletes first and
  hands their ids to the second pass — `drizzle-seed`'s `with` needs a real
  reference, and only `coach_message.thread_id` has one.
- **`pnpm db:seed` truncates.** It refuses to run when `NODE_ENV`/`APP_ENV` says
  production or `DATABASE_URL` isn't local, and it is deterministic, so the rows
  are the same every run.

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
- **A model call is traced through `observeTurn`, never by hand.**
  `ai-observability.ts` owns the whole shape — one `$ai_trace` per turn, an
  `$ai_generation` per model call under it, an `$ai_span` per tool call under
  *that* — and posthog.ts owns writing the three. Spread `turn.callbacks` into
  `streamText`/`generateText` and call `turn.end()`; a new model call anywhere
  in the app is those two lines, not a new event.
- **Don't reach for `withTracing`** from `@posthog/ai` — it throws on an AI SDK
  v7 model and demands an OpenTelemetry exporter. The SDK's own
  `onLanguageModelCallStart`/`End` and `onToolExecutionEnd` already carry the
  prompt, the tokens, the latency and the stop reason. `onFinish` alone is not
  enough: it only ever sees the last step, and a coach answer is up to eight.
- **A turn is one trace id, and everything else hangs off it.** `$ai_session_id`
  is the thread, so a conversation reads as one; `$session_id` is the browser's
  replay, which reaches the API as `X-POSTHOG-SESSION-ID` on the chat request
  (set in `coach-chat.tsx`, not by patching `fetch` with `tracing_headers`).
- **The trace id goes back to the browser on the message**, as
  `metadata.trace_id` — written by `messageMetadata` in the chat route and
  stored with the answer, because a rating happens after the stream is over and
  often after a reload. Anything that wants to say something about an answer
  later (a rating, an eval, a bug report) hangs off that id.
- **A thumbs up/down is a survey response, not an event.** `rateCoachAnswer` and
  `noteCoachAnswer` write `survey sent` with `$ai_trace_id` and a shared
  `$survey_submission_id`, which is what puts a rating and its note on the
  trace's Feedback tab as one response. It needs
  `VITE_POSTHOG_COACH_SURVEY_ID`; without it the thumbs aren't drawn.
- **The feedback UI is ours, the survey is PostHog's schema.** `displaySurvey`
  would draw PostHog's own pop-up over the transcript, in neither of this app's
  languages and in none of its type; `coach-feedback.tsx` draws the row and asks
  the follow-up itself and sends the same events. The survey's questions still
  have to exist — a response is filed under a question's id — but their wording
  is never shown to an athlete.
- **Coach transcripts stay private by default** (`privacyMode`), so the LLM
  events carry the numbers and not the conversation — including `$ai_span`'s
  tool arguments and results, which posthog.ts redacts itself. The opt-in is
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
  build time, so it is a Docker build arg, not a runtime env var. `signInUrl` is
  a *function* of the locale — see the i18n section below.
- **Every page lives under `app/[locale]`.** `generateStaticParams` prerenders
  `/en` and `/fr`; `src/proxy.ts` is the only per-request code. A new route goes
  inside the segment, or it has no language — and it goes in `SITE_PAGES`
  (`src/lib/pages.ts`), which is the one list the sitemap, `llms.txt`, the
  Markdown route and the proxy's "does this URL exist?" all read.
- **The proxy decides three things: representation, language, existence.** In
  that order, and the order matters — an agent asking for Markdown at `/` is
  answered at `/`, not sent through a redirect first.
- **A URL that names no page is a 404 where it stands.** It used to be redirected
  into a locale and 404 there, so the honest answer to "does this exist?" was a
  307 — which an agent that doesn't follow redirects reads as yes. The proxy
  rewrites it to `/{locale}/404` with `status: 404` on the rewrite. That sentinel
  slug is `NOT_FOUND_SLUG`, it is in `generateStaticParams`, and it is why there
  is no `not-found.tsx`: that file renders without `params`, so it would have to
  read the language from a header — and one `headers()` call inside `[locale]`
  turns every page under it from a prerendered document into an on-demand render.
- **Any page also serves Markdown** — `Accept: text/markdown`, or `.md` on the
  path (acceptmarkdown.com). It is a *second rendering of the same catalogue*
  (`src/lib/markdown.ts`), never a conversion of the HTML, so the two can't
  drift. `Vary: Accept` rides on every response the proxy still owns; App Router
  overwrites it on a page response with its own router list, which costs nothing
  here because the proxy negotiates above the page cache.
- **`/llms.txt` is the agent-facing index** (`src/lib/llms.ts`), to llmstxt.org's
  format: H1, blockquote, heading-free prose, then H2 sections that are link
  lists. Its "When to use Vivace" section names a job and a URL per line — that
  is the part an agent acts on, and marketing adjectives are worse than useless
  in it. English only: there is one such file and it has no locale to negotiate.
  `/llms-full.txt` is every page, both languages, one document.
- Hero-replay maths lives in `src/lib/replay.ts` as pure functions of `t` and is
  unit-tested. Keep it pure — the server and the first client frame must agree, or
  React logs a hydration mismatch.

## Copy — English and French, never inline

Both apps ship EN and FR. A user-facing string belongs in a catalogue, and the
two catalogues are typed against each other so a missing translation is a
`pnpm typecheck` failure rather than an English sentence in a French screen.

The two apps use **different machinery on purpose** — they have different
rendering models, and the same rule about the module graph applies here as to
`button.tsx`: they share a vocabulary, not a package.

| | `apps/web` | `apps/landing` |
| --- | --- | --- |
| Machinery | i18next + react-i18next | a plain typed dictionary |
| Catalogue | `src/i18n/messages/{en,fr}.ts` | `src/i18n/messages/{en,fr}.ts` |
| Reaching it | `const { t } = useTranslation()` | `copy` prop, from `getDictionary(locale)` |
| Choosing it | detector: `?lang=` → localStorage → browser | `src/proxy.ts`: cookie → `Accept-Language` |
| Switcher | `<LanguageToggle>` (menu, client) | `<LanguageSwitcher>` (two links, server) |

- **`apps/landing` gets no i18n runtime, deliberately.** The page is Server
  Components end to end and has to stay prerenderable, so the dictionary is read
  on the server and only rendered strings reach the browser. Sections take a
  `copy` prop — context would need a client boundary, which is the thing being
  avoided. Reach for `next-intl` when the copy needs plurals or dates, not before.
- **`fr.ts` is typed `Translated<Messages>`** — the English catalogue's shape with
  its literals widened to `string`. Add a key in English and the French file stops
  compiling, which is the point. `messages.test.ts` catches what the type cannot:
  an empty string, a dropped `{{placeholder}}`, an array that lost an entry.
- **Dates go through `src/i18n/format.ts` (web), never `Intl` at a call site.**
  Every formatter reads its locale from the language in force and formats in UTC —
  `start_date_local` carries the athlete's wall clock with a `Z` suffix, so a run
  at 23:30 on New Year's Eve lands in the wrong year otherwise.
- **The two apps hand the language over in the URL.** A landing CTA leaves for
  `/login?lang=fr`, and `?lang=` is the first thing web's detector reads. That is
  the whole handoff: no shared cookie, no shared origin assumption.
- **`packages/video` keeps its English.** It is React-free and it runs on Lambda,
  where no catalogue is loaded. `apps/web` translates the catalogue *by id*
  through `src/i18n/video.ts` and falls back to the package's own words, so a
  template added without a translation still renders. Eligibility reasons carry a
  `reasonKey` for the same reason — matching on the English sentence would break
  silently the first time it was reworded.
- **A chip that is also a question is one string.** The coach's suggestion chips
  are stored as catalogue *keys* and translated at render, because the same text
  is shown on the chip and sent to the model — a French athlete's question should
  reach the coach in French.
- **Server-generated copy is not covered.** Coach answers, card sentences, signal
  labels and API error messages are written in `apps/api` and are English in both
  languages. Localising those is an API change, not a front-end one.

## Checks

`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`
must pass before a change is done. CI runs exactly that list.

Two husky hooks catch a subset of it earlier, installed by the root `prepare`
script on `pnpm install`:

- **`pre-commit` runs `pnpm lint-staged`** — `prettier --write`, then
  `eslint --fix --max-warnings=0`, then `turbo run typecheck` for *only* the
  workspaces owning the staged files. The first two re-stage what they rewrite,
  so a formatting-only problem fixes itself. It is a fast gate, not CI: no tests,
  no builds, and it only sees staged files.
- **`commit-msg` runs `pnpm commitlint --edit $1`.** Commit messages are
  Conventional Commits; there is deliberately no scope allow-list.

Lint and format rules that will bite if you don't know them:

- **One root config each** (`eslint.config.mjs`, `prettier.config.mjs`) for all
  five workspaces. Don't add a per-workspace lint toolchain.
  `eslint-config-prettier` is last, so ESLint never argues about formatting.
- **Markdown is not formatted.** `*.md` is in `.prettierignore` because
  Prettier's Markdown printer rewrote `+ template` — the wrapped continuation of
  "`run_render`'s key is user + activity + template" — into a `-` list bullet.
  It changes what sentences say. Leave it off.
- **Generated artifacts and `.agents/`/`.claude/` are excluded from both tools.**
  The first are rewritten by `pnpm generate`; the second are pinned by hash in
  `skills-lock.json`.
- **`no-console` is an error under `src/`** (tests and `scripts/` excepted),
  which is the logging rule above made mechanical.
- **Type-aware rules only cover `src/` and `scripts/`.** Adding one elsewhere
  means the project service has no tsconfig for the file and errors.
- **`no-misused-promises` deliberately skips void-return positions** (JSX
  attributes, properties, variables) — an async `onClick` is idiomatic, not a
  bug. Don't "fix" the config when you see one.
