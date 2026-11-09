FROM node:22-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202 AS build
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
COPY apps/landing/src apps/landing/src

# Vite inlines VITE_* at build time, so the PostHog project is a build input
# rather than a runtime variable. Unset simply builds without analytics.
ARG VITE_SITE_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
ARG VITE_POSTHOG_KEY
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
ARG VITE_POSTHOG_UI_HOST
ENV VITE_POSTHOG_UI_HOST=$VITE_POSTHOG_UI_HOST
# Which deploy the events say they came from. Vite's mode is `production` for
# every image built here, which is right for production and wrong for a staging
# or local stack — this is how those say so.
ARG VITE_APP_ENV
ENV VITE_APP_ENV=$VITE_APP_ENV

RUN pnpm --filter @repo/web build

FROM nginx:alpine@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
