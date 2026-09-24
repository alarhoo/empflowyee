# HCM access-control contracts

Runtime-universal role query, permission and command DTOs with strict command validation. No database rows or browser/server implementation imports.

Design: [Role Management TDD](../../../../docs/hcm/apps/role-management/TDD.md).

## Verification

`pnpm nx lint hcm-access-control-contract` validates this project.

`pnpm nx test hcm-api-access-control-module` runs the actual NestJS role endpoints against disposable PostgreSQL. `pnpm hcm:db:test` includes the wider migration, seed, tenant and access/audit foundation checks.
