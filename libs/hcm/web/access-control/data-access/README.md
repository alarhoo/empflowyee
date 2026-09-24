# HCM access-control HTTP data

Typed role and permission queries and revisioned commands over the real NestJS API. Runtime context propagation belongs to the shared HTTP interceptor. No business fixtures or cross-persona cache.

Design: [Role Management TDD](../../../../../docs/hcm/apps/role-management/TDD.md).

## Verification

`pnpm nx lint hcm-web-access-control-data-access` validates this project.

Start `pnpm dev:hcm-api` and `pnpm dev:hcm`, then run
`pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts role-management`.
This uses persisted local personas and creates/deletes acceptance roles through the real API; their audit events remain.
