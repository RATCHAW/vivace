# apps/e2e — the end-to-end suite, and the stack you can click through

Playwright, driving a browser at the real Vite app, which proxies to the real
Hono API, which reads and writes a real Postgres.

```bash
pnpm e2e:db     # docker compose --profile e2e up -d db-e2e
pnpm e2e        # from the repo root
```

`pnpm --filter @repo/e2e e2e:ui` opens Playwright's UI mode, and
`e2e:report` opens the HTML report of the last run.

## `pnpm dev:fake` — the same stack, with nobody driving it

```bash
pnpm dev:fake:db   # docker compose --profile dev-fake up -d db-dev-fake
pnpm dev:fake      # from the repo root
```

Three servers around the same fake Strava, left running so you can sign in as
one athlete in a window and the other in a private one, and click through a
feature that needs both of them.

That is the only way to try some of them by hand. This repository's Strava app is
in Single Player Mode, so a second real account cannot authorise it at all — and
even with an access increase from Strava, checking a two-runner layout would mean
finding a friend and going for a run first.

It is a *development* stack, not the suite: its database is a volume rather than
`tmpfs` and nothing truncates it, so the invitation you accepted this morning is
still accepted this afternoon. It runs the API and Vite in watch mode, so it is
something to keep open while changing the code it is running.

The script in this workspace is `dev:fake`, not `dev`, and it has to stay that
way. `pnpm dev` at the root is `turbo run dev`, which runs the `dev` script of
*every* workspace that has one — and this one starts a second API and a second
Vite of its own. Named `dev`, it turned `pnpm dev` into six servers instead of
three, and a missing `db-dev-fake` took the real stack down with it.

Ports sit a hundred above the suite's — app **5373**, API **3200**, fake Strava
**4200**, database **5534** — so both can be up at once, and
`DEV_FAKE_PORT_OFFSET` shifts the set the same way `E2E_PORT_OFFSET` does.

### The map will be black unless Mapbox knows this origin

Mapbox tokens are restricted by URL, and the one in `apps/web/.env` is almost
certainly scoped to the development origin — which this is not. The style still
loads, so the map mounts and stamps its logo on the plate; then every *tile* 403s
and the map often never reaches `load`, so the route layers are never added
either. What you get is a film whose type, numbers and bars are all correct over a
black rectangle, which reads as a broken template rather than as a token.

`dev.ts` makes one request at startup and says so if that is what is happening.
Add `http://127.0.0.1:5373` to the token, or unset `VITE_MAPBOX_TOKEN` to get the
bare canvas plate deliberately — the compositions draw the route on it either way.

### What it still cannot do for you

A Lambda render, unless `REMOTION_FUNCTION_NAME` and `REMOTION_SERVE_URL` are
set — those are passed through from your shell and `.env`, along with
`MAPBOX_TOKEN` and the AWS credentials. Note that Lambda cannot reach a fixture
avatar served from `127.0.0.1`, so a render started here draws the plain dot
rather than the face; the browser's own player shows the avatar correctly.

## Only Strava is fake

Everything under test is the code that ships — the OAuth plugin, the generated
Strava SDK, the routes, the migrations, the React app. The single seam is the
*address* Strava lives at:

| Variable | Read by | Default |
| --- | --- | --- |
| `STRAVA_API_BASE_URL` | `@repo/strava-api` | `https://www.strava.com/api/v3` |
| `STRAVA_OAUTH_BASE_URL` | `apps/api/src/auth.ts` | `https://www.strava.com` |

Both are **inert when `NODE_ENV`/`APP_ENV` says production**, and deliberately
so: an override there would point every athlete's access token, or every
athlete's consent screen, at whatever address the environment named. That is an
exfiltration vector, not a configuration option.

`fake-strava.ts` implements only what the flow touches — the authorize screen
(as two links, one per fixture athlete), the token exchange, `/athlete`,
`/athlete/activities`, `/activities/:id` and its streams, and a drawn SVG
profile picture so the avatar option has something to put on the map. Which
athlete you are rides in the authorization code and then in the access token, so
two browser contexts are two different people against one server.

It also serves a 404 for an activity belonging to somebody else, which is
load-bearing: the API's ownership check *is* Strava refusing to serve an
activity to a token that doesn't own it.

## The fixture is a pairing

`athletes.ts` gives Ayoub and Sam the same Saturday run thirty seconds apart, and
gives Sam a decoy that evening. The decoy is the point — if the matcher's time
window ever stops working, the suite says so rather than passing with a longer
list.

`streams.ts` records those runs the way a watch would, at Strava's own 1 Hz: a
loop with a lane on it, a pace shape, a heart rate and a climb. Two things there
are load-bearing rather than decorative. The **lane** is what makes two people
who ran together two visible traces instead of one — the fixture used to hand
every run the identical twenty-point diagonal, which is a film of one line with
another hidden exactly underneath it. The **pace shape** is what makes the live
numbers move; a flat multiplier gives every frame the same pace and hides
anything that reads them wrongly.

Nothing is randomised — the receiver noise is seeded on the run's id. A ranked
list that reshuffles between runs is a flaky test, and a route that wanders
between runs is a screenshot you cannot compare.

## Ports and state

Its own database on **5434**, its own API on **3100**, its own Vite on **5273**,
fake Strava on **4100** — and the whole set shifts together:

```sh
E2E_PORT_OFFSET=10 pnpm e2e:db && E2E_PORT_OFFSET=10 pnpm e2e
```

That matters because this repository is worked on in several checkouts at once,
and every one of them wants the same four ports. Without the offset the second
worktree to run the suite fails on a port bind — or worse, quietly finds the
first one's database and truncates it. One number moves all four, so the set can
never half-move.

None of them are the development ports either, so `pnpm dev` can keep running
while the suite does — and, more importantly, a suite that
truncates every table between runs is never one typo away from the database you
have been signing into all afternoon. The container is `tmpfs`-backed; none of
it is worth surviving a reboot.

`global-setup.ts` migrates and truncates. It names the tables it empties rather
than discovering them, so a table added to the schema shows up as a test quietly
depending on the last run's data instead of being silently swept.

## What it does not cover

Strava itself. Whether the real API still returns what the fake claims it does
is a question for the committed Swagger and for
`packages/strava-api/openapi/strava-swagger.json`, not for this suite.
