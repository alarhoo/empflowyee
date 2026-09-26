# HCM workforce-foundation data-access

Browser data access for the workforce-foundation domain. It calls the tenant-scoped
`/api/v1/workforce-foundation` API through the runtime-universal
`hcm-workforce-foundation-contract` DTOs; it holds no fixture data.

See the [domain design](../../../../../docs/hcm/domains/workforce-foundation/TECHNICAL-DESIGN.md) and the
[Organization Structure technical design](../../../../../docs/hcm/apps/organization-structure/TDD.md).

Run the project lint target with Nx. PostgreSQL integration coverage runs through
`pnpm hcm:db:test`; browser acceptance is in `apps/hcm/web-e2e/live/organization-structure.spec.ts`.
