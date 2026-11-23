# Budowany z katalogu głównego repo: docker build -f apps/api/Dockerfile .
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
USER node
EXPOSE 3000
CMD ["node", "dist/index.mjs"]
