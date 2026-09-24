# HCM access-control composition

Composes verified runtime context, role use cases, transaction adapters and NestJS transport. Local activation requires the existing explicit local runtime flags and loopback database configuration. It never migrates or seeds at API startup.

Design: [Role Management TDD](../../../../../docs/hcm/apps/role-management/TDD.md).

## Verification

`pnpm nx lint hcm-api-access-control-module` validates this project.

`pnpm nx test hcm-api-access-control-module` runs the actual NestJS role endpoints against disposable PostgreSQL. `pnpm hcm:db:test` includes the wider migration, seed, tenant and access/audit foundation checks.
