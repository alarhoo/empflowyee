# Build from the repository root; deployment configuration is supplied only at runtime.
FROM node:24.21.0-bookworm-slim AS build
WORKDIR /workspace
ENV CI=true NX_DAEMON=false
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/account/api/package.json ./apps/account/api/package.json
COPY apps/hcm/api/package.json ./apps/hcm/api/package.json
COPY apps/console/api/package.json ./apps/console/api/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm nx build account-web --configuration=production
RUN pnpm exec node tools/containers/stage-angular-output.mjs account-web

# Serve only browser artifacts as an unprivileged user; startup generates public configuration.
FROM nginx:stable-alpine AS runtime
RUN apk add --no-cache jq \
    && mkdir -p /usr/share/nginx/html/assets /var/cache/nginx /var/run \
    && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run
COPY containers/angular/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=755 containers/angular/docker-entrypoint.d/10-runtime-config.sh /docker-entrypoint.d/10-runtime-config.sh
COPY --from=build --chown=nginx:nginx /workspace/.container-output/static/ /usr/share/nginx/html/
ARG REVISION=local
ARG BUILD_DATE
ARG RELEASE_ID=local
LABEL org.opencontainers.image.source="https://github.com/alarhoo/empflowyee" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.title="account-web" \
      org.opencontainers.image.version="${RELEASE_ID}"
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1:8080/health/live || exit 1
