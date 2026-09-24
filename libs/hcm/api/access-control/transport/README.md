# HCM access-control transport

NestJS role and permission endpoints. Validates bounded queries and commands, local same-origin writes, request IDs and safe error responses. Authorization is enforced again by the application unit of work.

Design: [Role Management TDD](../../../../../docs/hcm/apps/role-management/TDD.md).

## Verification

`pnpm nx lint hcm-api-access-control-transport` validates this project.

`pnpm nx test hcm-api-access-control-module` runs the actual NestJS role endpoints against disposable PostgreSQL. `pnpm hcm:db:test` includes the wider migration, seed, tenant and access/audit foundation checks.
