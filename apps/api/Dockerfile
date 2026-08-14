FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Every workspace manifest is needed so pnpm can validate the lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/strava-api/package.json packages/strava-api/package.json
COPY packages/video/package.json packages/video/package.json
# The container executes TypeScript through the runtime `tsx` dependency, but
# none of the test, migration-CLI, or bundler toolchain belongs in production.
#
# Better Auth declares both Vitest and drizzle-kit as *optional peers*, which
# pnpm resolves into the production graph because this workspace has them — so
# `--prod` alone leaves behind Vite's old esbuild 0.25 line and the whole 10 MB
# drizzle-kit CLI with its own esbuild 0.18 and the deprecated @esbuild-kit
# loader. The schema still migrates at boot without any of it: `drizzle-orm`'s
# migrator is a runtime dependency and reads the committed SQL in apps/api/drizzle.
#
# Only those lines: tsx runs TypeScript through its own esbuild (~0.28), which
# must survive this cleanup or the CMD below cannot start.
RUN pnpm install --frozen-lockfile --prod --filter @repo/api... \
  && corepack disable \
  && rm -rf \
    /root/.cache/node/corepack \
    /root/.local/share/pnpm \
    /repo/node_modules/.pnpm/@esbuild+*@0.25.* \
    /repo/node_modules/.pnpm/esbuild@0.25.* \
    /repo/node_modules/.pnpm/drizzle-kit@* \
    /repo/node_modules/.pnpm/@esbuild-kit+* \
    /repo/node_modules/.pnpm/@esbuild+*@0.18.* \
    /repo/node_modules/.pnpm/esbuild@0.18.* \
    /usr/local/lib/node_modules/corepack \
    /usr/local/lib/node_modules/npm

COPY packages/strava-api packages/strava-api
COPY packages/video packages/video
COPY apps/api apps/api

ENV NODE_ENV=production

USER node

EXPOSE 3000
CMD ["node", "apps/api/node_modules/tsx/dist/cli.mjs", "apps/api/src/index.ts"]
