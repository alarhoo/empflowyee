# Container runtime architecture

## Release model

```text
Git commit
   |
   v
Nx affected deployables
   |
   v
Docker build once
   |
   v
Artifact Registry digest
   |
   +------> DEV + DEV runtime config/secrets
   |
   +------> QA + QA runtime config/secrets
   |
   +------> PROD + PROD runtime config/secrets
```

The digest is invariant. Configuration is not.

## Runtime classes

### Static Angular web

- `account-web`
- `hcm-web`
- `console-web`

Build output is served by NGINX.

Runtime responsibilities:

- generate `/assets/config.json`
- SPA route fallback
- static caching policy
- health endpoints
- security headers that are safe to standardize centrally

### Next.js Node web

- `marketing-web`

Runtime responsibilities:

- listen on Cloud Run `PORT`
- server-runtime configuration
- health endpoint
- graceful process behavior

### NestJS Node API

- `account-api`
- `hcm-api`
- `console-api`

Runtime responsibilities:

- strict configuration validation
- listen on Cloud Run `PORT` and `0.0.0.0`
- health contract
- structured logs to stdout/stderr
- graceful SIGTERM shutdown

## No cross-environment images

Never encode these in the build:

- DEV API URLs
- QA API URLs
- PROD API URLs
- environment-specific OAuth client IDs when they vary by environment
- database connection details
- secrets

## Image metadata

Every release image should carry OCI labels for at least:

- source repository
- commit SHA
- creation timestamp
- deployable/project name
- release ID

Deployment records must store the image digest, not only a mutable tag.
