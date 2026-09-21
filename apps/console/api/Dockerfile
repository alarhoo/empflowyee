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
RUN NODE_ENV=production pnpm nx run console-api:prune

# Install only the dependencies declared by Nx's pruned deployment output.
FROM node:24.21.0-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
COPY --from=build /workspace/dist/apps/console/api/ ./
RUN pnpm install --prod --frozen-lockfile

# The runtime contains no source workspace or build toolchain.
FROM node:24.21.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=dependencies --chown=node:node /app/ ./
COPY containers/node/healthcheck.mjs /healthcheck.mjs
ARG REVISION=local
ARG BUILD_DATE
ARG RELEASE_ID=local
# The build identity travels with the immutable image through every environment.
ENV RELEASE_ID=${RELEASE_ID}
LABEL org.opencontainers.image.source="https://github.com/alarhoo/empflowyee" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.title="console-api" \
      org.opencontainers.image.version="${RELEASE_ID}"
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD ["node", "/healthcheck.mjs"]
CMD ["node", "main.js"]
