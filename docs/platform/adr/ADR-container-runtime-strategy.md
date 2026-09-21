# ADR — Container and runtime configuration strategy

## Status

Accepted.

## Context

empFLOWyee has seven independently deployable applications in one Nx monorepo and promotes the same release through DEV, QA and PROD. Rebuilding for each environment would break artifact identity and make UAT less meaningful.

## Decision

1. Build each affected deployable exactly once per release.
2. Push the image to the central Artifact Registry.
3. Promote by immutable image digest.
4. Keep environment-specific configuration outside the image.
5. Store secrets in Google Secret Manager.
6. Use runtime configuration for values that differ between DEV, QA and PROD.
7. Integrate Docker with Nx using `@nx/docker`.
8. Use Nx's current prune workflow for containerized NestJS/Node applications rather than legacy generated-package-json behavior.

## Runtime-specific decisions

### Angular

Angular output is static. One immutable static image is used in all environments. On container startup a small public JSON file is generated at `/assets/config.json` from non-secret environment variables.

### NestJS

NestJS receives environment and Secret Manager values at process startup. Required configuration is validated before the HTTP listener starts. The server listens on Cloud Run's `PORT` and `0.0.0.0`.

### Next.js

The Marketing site runs as a Node/Next.js service. Environment-varying values are resolved at runtime on the server. Values that vary by environment must not be compiled into client `NEXT_PUBLIC_*` constants.

## Consequences

- DEV, QA and PROD can run different releases from the same `main` history.
- UAT validates the same image later promoted to production.
- Rollback means redeploying a known-good digest.
- Browser runtime config is public and must never contain secrets.
- Runtime configuration contracts require explicit validation and tests.
