# HCM-3 scoped access foundation

Implemented 2026-09-28 on `codex/hcm-3-access-foundation`, against
[COMMON AUTHORIZATION](../architecture/TDD-HCM-3-COMMON.md#authorization).
This is an infrastructure prerequisite; no HCM-3 app is marked complete.

Migration `000034_access_grant_scopes.sql` adds optional tenant-owned, typed scope
children to existing role grants. Composite workforce/grant foreign keys, ENABLE/
FORCE RLS, target shape checks and uniqueness are enforced in SQL. Protected
administrator grants cannot be narrowed. Existing grants without scope rows
retain their existing tenant-wide semantics.

One qualifying grant must cover the entire verified source subject. Multiple
targets in one dimension are alternatives; different dimensions intersect within
that grant. Missing subject facts deny restricted access. Grants are never pooled.
Authenticated access acquires a shared tenant revocation lock; administration
uses the existing exclusive lock, and authorization reloads after that wait.
Returned internal actor evidence includes the matching grant ID.

## Verification

- Real disposable PostgreSQL: new scope suite plus existing access foundation,
  **14 tests passed**. Covers foreign physical rows, tenant substitution, composite
  references, protected administration, invalid targets, UPDATE denial, same-grant
  matching, unscoped query rejection and revocation before authorization.
- TypeScript infrastructure check passed with `--noEmit --allowImportingTsExtensions`;
  the latter supports the existing seed-tool imports used by integration tests.
- `pnpm nx run hcm-api:build` passed.
- Architecture check passed; changed TypeScript is checked with repository ESLint
  and Prettier. No production gate or RLS policy was relaxed.

The developer database was not reset or migrated by these tests. They use the
repository's uniquely named disposable PostgreSQL harness. No new scope editor,
delegation authority or HCM-3 business API is claimed delivered by this slice.
