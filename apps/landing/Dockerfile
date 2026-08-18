FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Every workspace manifest is needed so pnpm can validate the lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/landing/package.json apps/landing/package.json
COPY packages/strava-api/package.json packages/strava-api/package.json
COPY packages/video/package.json packages/video/package.json
RUN pnpm install --frozen-lockfile --filter @repo/landing...

COPY apps/landing apps/landing
# NEXT_PUBLIC_* is baked into the bundle, so the app's origin — and the PostHog
# project it reports to — are build inputs, not runtime variables
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
# Which deploy the events say they came from. `next build` reports `production`
# for every image built here, which is right for production and wrong for a
# staging or local stack — this is how those say so.
ARG NEXT_PUBLIC_APP_ENV
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV
# This page's own origin. It goes into the canonical and hreflang tags, which
# have to be absolute — a wrong one points search engines at the wrong host.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN pnpm --filter @repo/landing build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# The standalone server runs with Node directly; package managers only add
# unused executables and their transitive vulnerability surface at runtime.
RUN corepack disable \
  && rm -rf /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm

# `output: "standalone"` traces from the monorepo root, so the server lands at
# apps/landing/server.js with its node_modules beside it.
COPY --chown=node:node --from=build /repo/apps/landing/.next/standalone ./
COPY --chown=node:node --from=build /repo/apps/landing/.next/static ./apps/landing/.next/static

USER node

EXPOSE 3001
CMD ["node", "apps/landing/server.js"]
