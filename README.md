# Strava Login App

A Turborepo monorepo: sign in with Strava (and only Strava), then see your basic Strava profile.

## Stack

| Piece | Choice |
| --- | --- |
| Monorepo | [Turborepo](https://turbo.build) + [pnpm](https://pnpm.io) workspaces |
| API | Node.js + [Hono](https://hono.dev) (`apps/api`) |
| Auth | [better-auth](https://better-auth.com) with the generic OAuth plugin (Strava) |
| Database | Postgres (via Docker) |
| Web | [Vite](https://vite.dev) + React (`apps/web`) |
| UI | [shadcn/ui](https://ui.shadcn.com) + [Tailwind CSS v4](https://tailwindcss.com) |
| Tests | [Vitest](https://vitest.dev) |
| Shared code | `packages/shared` (types used by both apps) |

## Prerequisites

- Node.js ≥ 20.19 and Docker
- pnpm 10 — `corepack enable` picks up the pinned version from `packageManager`,
  or install it directly with `npm i -g pnpm@10`
- A Strava API application: create one at <https://www.strava.com/settings/api>
  - Set **Authorization Callback Domain** to `localhost`

## Getting started

```sh
pnpm install

# 1. Configure the API
cp apps/api/.env.example apps/api/.env
#    → fill in STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET,
#      and set BETTER_AUTH_SECRET (openssl rand -base64 32)

# 2. Start Postgres and create the auth tables
pnpm db:up
pnpm auth:migrate

# 3. Run everything
pnpm dev
```

Open <http://localhost:5173/login> and click **Continue with Strava**. After authorizing,
you land on `/` with your name, avatar, and basic athlete info pulled live from the
Strava API (`GET /api/v3/athlete`).

## How the auth flow works

1. The login button calls `authClient.signIn.oauth2({ providerId: "strava" })`.
2. The API (better-auth mounted at `/api/auth/*` in Hono) redirects to Strava's OAuth
   page and handles the callback at `/api/auth/oauth2/callback/strava`.
3. Strava doesn't expose the athlete's email, so a stable placeholder
   (`strava-<id>@users.noreply.strava.local`) is stored instead.
4. `GET /api/me/strava` reads your session, gets the stored Strava access token
   (auto-refreshing it when expired), and proxies the athlete profile.

In dev, Vite proxies `/api` → `http://localhost:3000`, so the browser only ever talks
to one origin.

## UI

**shadcn/ui is the default for anything UI.** Reach for a registry component before
hand-rolling markup or writing bespoke CSS.

- Config lives in [`apps/web/components.json`](apps/web/components.json) —
  style `base-nova` ([Base UI](https://base-ui.com) primitives, Lucide icons, Geist).
- Components are vendored into `apps/web/src/components/ui/` and are **yours to edit**;
  they are normal source files, not a locked dependency.
- Design tokens (colours, radii, dark mode) live in `apps/web/src/styles.css`.
  Style with tokens — `bg-card`, `text-muted-foreground`, `border-border` — not raw
  hex, so light and dark both stay correct. Brand colours that fall outside the token
  set get their own `@theme` entry (see `--color-strava`).
- Dark mode is class-based via `next-themes`; the provider is in `src/main.tsx`.

```sh
# add a component (button, dialog, table, …) — see https://ui.shadcn.com/docs/components
pnpm --filter @repo/web ui:add table

# already installed
# alert  avatar  badge  button  card  dialog  dropdown-menu
# input  label  separator  skeleton  sonner  tooltip
```

## Commands

```sh
pnpm dev        # run api + web in watch mode (turbo)
pnpm build      # build all workspaces
pnpm test       # run all vitest suites
pnpm typecheck  # tsc --noEmit everywhere
pnpm db:up      # start Postgres only (docker compose)
pnpm auth:migrate  # create/update better-auth tables in Postgres

# target a single workspace
pnpm --filter @repo/api dev
pnpm --filter @repo/web test
```

## Running fully in Docker

```sh
BETTER_AUTH_SECRET=... STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... \
  docker compose --profile app up --build
```

Web is served at <http://localhost:8080> (nginx proxies `/api` to the API container).
Note: for the Docker setup, set `BETTER_AUTH_URL`/`WEB_ORIGIN` accordingly in
`docker-compose.yml` if you change ports.

## License

[CC BY-NC-SA 4.0](./LICENSE) — anyone may use, modify, and share this source code,
**but** derivatives must stay under the same license (ShareAlike ≈ "keep it open
source") and **commercial use is not permitted** (NonCommercial). Note this is
therefore not an OSI-approved "open source" license, which by definition would have
to allow commercial use.
