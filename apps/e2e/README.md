# apps/e2e — the end-to-end suite

Playwright, driving a browser at the real Vite app, which proxies to the real
Hono API, which reads and writes a real Postgres.

```bash
pnpm e2e:db     # docker compose --profile e2e up -d db-e2e
pnpm e2e        # from the repo root
```

`pnpm --filter @repo/e2e e2e:ui` opens Playwright's UI mode, and
`e2e:report` opens the HTML report of the last run.

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
`/athlete/activities`, `/activities/:id` and its streams. Which athlete you are
rides in the authorization code and then in the access token, so two browser
contexts are two different people against one server.

It also serves a 404 for an activity belonging to somebody else, which is
load-bearing: the API's ownership check *is* Strava refusing to serve an
activity to a token that doesn't own it.

## The fixture is a pairing

`athletes.ts` gives Ayoub and Sam the same Saturday run thirty seconds apart, and
gives Sam a decoy that evening. The decoy is the point — if the matcher's time
window ever stops working, the suite says so rather than passing with a longer
list.

Nothing is randomised. A ranked list that reshuffles between runs is a flaky
test.

## Ports and state

Its own database on **5434**, its own API on **3100**, its own Vite on **5273**,
fake Strava on **4100**. None of them are the development ports, so `pnpm dev`
can keep running while the suite does — and, more importantly, a suite that
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
