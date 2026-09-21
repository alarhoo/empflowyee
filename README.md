# empFLOWyee container & runtime configuration foundation

The container/runtime foundation is applied to all seven deployable Nx applications.

Per-project Dockerfiles use the official Nx Docker targets. Shared platform libraries own runtime configuration and API startup behavior. See [local verification and commands](docs/platform/engineering/container-validation.md) for the tested workflow.

## Deployable classes

| Deployable    | Runtime class           | UI/API         |
| ------------- | ----------------------- | -------------- |
| marketing-web | Next.js on Node         | public web     |
| account-web   | Angular static on NGINX | customer web   |
| account-api   | NestJS on Node          | customer API   |
| hcm-web       | Angular static on NGINX | tenant HCM web |
| hcm-api       | NestJS on Node          | tenant HCM API |
| console-web   | Angular static on NGINX | operator web   |
| console-api   | NestJS on Node          | operator API   |

## Architectural decisions

- Images are built once and promoted by immutable digest.
- Environment-specific values are injected at runtime, not compiled into the image.
- Browser runtime configuration is public-by-definition and must never contain secrets.
- Secrets live in Google Secret Manager and are exposed only to the runtime identity that needs them.
- Angular applications receive `/assets/config.json` at container startup.
- Next.js environment-varying values are read at server runtime; environment-varying values must not be compiled into `NEXT_PUBLIC_*` variables.
- NestJS reads process environment at startup and must fail fast if required configuration is invalid.
- Cloud Run's injected `PORT` is authoritative for Node services.
- NestJS must bind to `0.0.0.0`.
- Static web containers listen on `8080`.
- Every deployable has health endpoints.
- APIs handle `SIGTERM` gracefully.
- Nx remains responsible for project graph/build orchestration; Docker is integrated with Nx rather than operated as an unrelated script island.

## Apply

Read `APPLY-TO-REPO.md` first.

## Next phase

After this foundation is integrated and the three runtime classes are proven locally, create the reusable Cloud Run Terraform module and deploy one representative service of each class to DEV.
