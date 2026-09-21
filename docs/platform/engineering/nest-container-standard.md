# NestJS container standard

Applies to `account-api`, `hcm-api`, and `console-api`.

## Nx deployment model

Prefer the Nx 23.2+ prune workflow for Node Docker deployments.

Expected target sequence:

```text
build
  -> prune-lockfile
  -> copy-workspace-modules
  -> prune
```

This produces deploy output containing compiled application code plus only required production package metadata/dependencies.

Do not add legacy `generatePackageJson` solely for Docker deployment when the workspace uses modern TypeScript solution setup.

## Runtime contract

The application must:

- read `PORT` supplied by Cloud Run
- default to `8080` only for non-Cloud-Run local execution
- bind to `0.0.0.0`
- validate required configuration before listening
- enable Nest shutdown hooks
- handle SIGTERM cleanly
- log to stdout/stderr

## Configuration validation

Missing or malformed required configuration is a startup failure, not a warning.

Validation categories:

- environment/release metadata
- database connectivity parameters
- identity provider configuration
- allowed origins/hosts
- integration endpoints
- feature infrastructure required to start the service

Secrets are still environment values at process boundary, but their source is Google Secret Manager rather than Git or the image.

## Health endpoints

Minimum:

```text
GET /health/live
GET /health/ready
```

`/health/live` verifies that the process can respond. It must not fail because an external database or third-party API is temporarily down.

`/health/ready` may check essential dependencies with tight timeouts. It must not expose dependency credentials or internal details.

A startup probe may use `/health/ready` only when that endpoint reliably means the application is safe to receive traffic.

## Repository implementation

Each API declares its production dependencies in its own `package.json`. Webpack bundles application/library source with `generatePackageJson: false`; the existing `prune-lockfile` and `copy-workspace-modules` targets own deploy metadata. The Docker builder runs `prune`, installs the emitted production manifest and frozen lockfile in a separate stage, then copies only that deploy directory into a non-root Node runtime.

`platform-api-runtime-module` supplies bootstrap, JSON logging and health endpoints outside the `/api` prefix. Production requires `APP_ENVIRONMENT` and `RELEASE_ID`; `PORT` defaults to 8080 when absent and must be an integer from 1 to 65535. Local `nx serve` retains ports 4400/4401/4402. Current scaffold APIs have no database or identity integration, so readiness confirms successful bootstrap only. Add dependency validation when those integrations are designed; do not invent credentials or silently accept missing required values.
