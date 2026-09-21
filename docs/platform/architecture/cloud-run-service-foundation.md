# Cloud Run service foundation

## Deployables

Each environment contains seven independent Cloud Run services:

```text
marketing-web
account-web
account-api
hcm-web
hcm-api
console-web
console-api
```

The Nx monorepo does not make them one deployment unit.

## Projects

```text
DEV   empflowyee-dev
QA    empflowyee-qa
PROD  empflowyee-prd
```

Region: `asia-south1`.

## Runtime classes

**Angular static:** account-web, hcm-web, console-web. NGINX container; HTTP `/health/ready` startup and `/health/live` liveness.

**NestJS:** account-api, hcm-api, console-api. Node container; HTTP `/health/ready` startup and `/health/live` liveness.

**Next.js:** marketing-web. Standalone Node container; HTTP `/health/ready` startup and `/health/live` liveness. These routes are already implemented in the container foundation.

The module permits TCP startup checks but requires HTTP liveness. The initial Google hello image is pinned by digest; both configured health paths were checked against that image locally. It is only a private bootstrap placeholder, not an empFLOWyee application release.

## Initial resource baseline

All services start at `min_instances = 0` to control early-stage cost. Explicit maximum-instance caps limit accidental scale-out. The values are starting guardrails, not capacity guarantees; tune them from load tests and production telemetry.

Services are private by default. The four DEV web services accept ordinary HTTPS browser requests under [ADR: DEV web browser access](../adr/ADR-dev-web-browser-access.md); the three DEV APIs and all QA/PROD services retain IAM protection. Public frontend delivery does not replace application authentication or tenant authorization.
