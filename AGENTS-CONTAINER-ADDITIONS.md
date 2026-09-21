# Additions for root AGENTS.md

Merge these rules into the root engineering instructions.

## Containers and runtime configuration

- Docker images are immutable release artifacts. Build once and promote the same digest through DEV, QA and PROD.
- Never compile environment-specific secrets or endpoints into an artifact when the value can vary by deployment environment.
- Browser runtime configuration is public and must never contain secrets.
- Runtime secrets belong in Google Secret Manager and are referenced by Cloud Run.
- Use the official Nx Docker integration. Docker work must remain visible in the Nx task/project graph.
- Inspect a project's real Nx build output before writing or changing its Dockerfile; never guess output paths.
- NestJS services must listen on Cloud Run `PORT`, bind to `0.0.0.0`, validate configuration before listening, and support graceful shutdown.
- Health endpoints must not disclose sensitive/internal diagnostic information.
- Liveness must not depend on databases or external providers.
- Environment configuration is distinct from tenant/business configuration. Tenant branding, locale, entitlement and authentication setup belong to product data, not Cloud Run environment variables.
- Do not run schema migrations implicitly on ordinary API process startup. Database migration orchestration requires an explicit deployment design.
