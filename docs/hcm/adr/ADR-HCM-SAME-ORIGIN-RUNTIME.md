# ADR — Same-origin tenant HCM web/API runtime

## Status

Implemented in application routing, runtime contracts and local proxy. Managed production ingress activation remains pending infrastructure review.

## Decision

Expose HCM web and HCM API under the same tenant hostname using path-based ingress routing:

- `/{anything except api}` -> HCM web
- `/api/*` -> HCM API

## Why

- API receives the tenant hostname directly from managed ingress.
- Same-origin browser requests reduce CORS complexity.
- Secure HttpOnly cookie sessions are practical.
- Tenant-configured authentication callbacks can remain scoped to the tenant hostname.
- Local development can mimic production with an Angular dev proxy.

## Security note

Host resolution identifies tenant context; it does not by itself authorize the user. Authenticated session membership and operation-level permission checks remain required.

## Implementation trust policy

The API resolves an exact normalized Host against the server tenant-directory port. It ignores `Forwarded`, `X-Forwarded-Host` and browser tenant identifiers. Production ingress must preserve Host and restrict direct service access as designed by IaC. Trusting forwarded headers would require an explicit trusted-proxy design rather than enabling Express `trust proxy` globally.

HCM deployment configuration requires the exact same-origin `/api` base path; Account/Console retain their existing absolute URL validation. The shared static container entrypoint accepts `/api` as an additional supported value. No existing contract is removed, and no deployment or IAM change is performed by this implementation.
