# Runtime configuration and secrets

Build-once/deploy-many requires strict ownership.

## Application source

Contains no environment secrets and must not bake DEV/QA/PROD-specific values into the artifact when those values differ by environment.

## Non-secret environment configuration

Owned by IaC under `infra/terraform/environments/<environment>/` and applied to Cloud Run.

## Secrets

Owned by Google Secret Manager in the target environment project. Cloud Run receives secret bindings through IaC.

## Deployment coordinates

GitHub Environments contain non-secret coordinates such as GCP project ID, region, WIF provider and service-account email.

Authentication uses GitHub OIDC + Workload Identity Federation. No service-account JSON key is stored in GitHub.

## Tenant/customer configuration

Logo, primary color, locale defaults, enabled apps and tenant auth policy are business data in empFLOWyee persistence, not CI/CD variables.

## Angular runtime config

Environment-specific browser configuration should be loaded at runtime, e.g. `/assets/config.json`, rather than compile-time Angular environment replacement.

## Next.js

Server-only values can resolve at runtime. Browser-exposed environment-specific values need a deliberate runtime strategy; do not assume `NEXT_PUBLIC_*` preserves build-once semantics.
