# Built from the repo root: docker build -f apps/api/Dockerfile .
FROM node:26-alpine AS base
RUN npm install -g pnpm@12.23.0
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter @split-pay/api...
RUN pnpm --filter @split-pay/api build
RUN pnpm --filter @split-pay/api deploy --prod --legacy /out

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
# Applied by the API on startup (src/db/migrate.ts); resolved as ../drizzle from dist/.
COPY --from=build /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 3000
# Busybox wget (alpine); 127.0.0.1 rather than localhost, which may resolve to ::1.
# start-period leaves room for migrations on a fresh database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1
CMD ["node", "dist/index.mjs"]
