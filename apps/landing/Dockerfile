FROM node:22-alpine AS build
WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Every workspace manifest is needed so pnpm can validate the lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/landing/package.json apps/landing/package.json
COPY packages/strava-api/package.json packages/strava-api/package.json
RUN pnpm install --frozen-lockfile --filter @repo/landing...

COPY apps/landing apps/landing
# NEXT_PUBLIC_* is baked into the bundle, so the app's origin is a build input
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm --filter @repo/landing build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# `output: "standalone"` traces from the monorepo root, so the server lands at
# apps/landing/server.js with its node_modules beside it.
COPY --from=build /repo/apps/landing/.next/standalone ./
COPY --from=build /repo/apps/landing/.next/static ./apps/landing/.next/static

EXPOSE 3001
CMD ["node", "apps/landing/server.js"]
