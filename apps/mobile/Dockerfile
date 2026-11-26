# The web app (read-only web Conversation, #88), built from the repo root:
#   docker build -f apps/mobile/Dockerfile \
#     --build-arg EXPO_PUBLIC_WEB_URL=https://app.kwitz.app \
#     --build-arg EXPO_PUBLIC_API_URL=https://api.kwitz.app .
# EXPO_PUBLIC_* values are inlined into the bundle at build time, so they are build args
# (Coolify: "Build Variable"). Runtime env only feeds the proxy target and the .well-known
# files (apps/mobile/docker/entrypoint.sh, docs/runbook.md "Web app").
FROM node:26-alpine AS build
RUN npm install -g pnpm@12.23.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @split-pay/mobile...
# Required: app.config.ts fails the export without EXPO_PUBLIC_WEB_URL.
ARG EXPO_PUBLIC_WEB_URL
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_APP_STORE_URL
ARG EXPO_PUBLIC_PLAY_STORE_URL
ARG EXPO_PUBLIC_SENTRY_DSN
ARG EXPO_PUBLIC_SENTRY_ENVIRONMENT
WORKDIR /repo/apps/mobile
RUN npx expo export -p web --output-dir dist

FROM caddy:2-alpine AS runtime
COPY apps/mobile/docker/Caddyfile /etc/caddy/Caddyfile
COPY apps/mobile/docker/entrypoint.sh /usr/local/bin/web-entrypoint
COPY --from=build /repo/apps/mobile/dist /srv/app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:8080/" > /dev/null || exit 1
ENTRYPOINT ["/bin/sh", "/usr/local/bin/web-entrypoint"]
