# HCM access-control domain

Framework-independent rules for immutable system roles, expected revisions and assigned-role deletion.

Design: [Role Management TDD](../../../../../docs/hcm/apps/role-management/TDD.md).

## Verification

`pnpm nx lint hcm-api-access-control-domain` validates this project.

`pnpm nx test hcm-api-access-control-module` runs the actual NestJS role endpoints against disposable PostgreSQL. `pnpm hcm:db:test` includes the wider migration, seed, tenant and access/audit foundation checks.
