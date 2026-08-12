FROM node:22-alpine
WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Every workspace manifest is needed so pnpm can validate the lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @repo/api...

COPY packages/shared packages/shared
COPY apps/api apps/api

EXPOSE 3000
CMD ["pnpm", "--filter", "@repo/api", "start"]
