FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Every workspace manifest is needed so pnpm can validate the lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/strava-api/package.json packages/strava-api/package.json
COPY packages/video/package.json packages/video/package.json
RUN pnpm install --frozen-lockfile --filter @repo/web...

COPY packages/strava-api packages/strava-api
COPY packages/video packages/video
COPY apps/web apps/web

# Vite inlines VITE_* at build time, so the PostHog project is a build input
# rather than a runtime variable. Unset simply builds without analytics.
ARG VITE_SITE_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
ARG VITE_POSTHOG_KEY
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
# Which deploy the events say they came from. Vite's mode is `production` for
# every image built here, which is right for production and wrong for a staging
# or local stack — this is how those say so.
ARG VITE_APP_ENV
ENV VITE_APP_ENV=$VITE_APP_ENV

RUN pnpm --filter @repo/web build

FROM nginx:alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
