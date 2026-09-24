# hcm-identity-access-contract

Domain-owned Identity Administration implementation. See the [approved design](../../../../docs/hcm/apps/identity-administration/TDD.md).

Generated using the official `@nx/js:library` generator with bundler/test runner `none`, ESLint and the project’s four ownership tags. SQL migrations define persistence; universal DTOs never expose rows.

Verify with `pnpm nx lint hcm-identity-access-contract` and `pnpm nx test hcm-api-identity-access-module`.
