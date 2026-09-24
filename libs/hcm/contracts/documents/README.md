# HCM documents documents

Documents-owned documents implementation for the approved HCM-1 local stage.
Uses explicit contracts and tenant-scoped API data; business screens have no fixture data or feature CSS.

See the [domain policy](../../../../docs/hcm/domain/HCM-1-DOCUMENTS.md) and
[Document Types technical design](../../../../docs/hcm/apps/document-types/TDD.md).

Run the project lint target with Nx. PostgreSQL integration coverage runs through
`pnpm hcm:db:test`; browser acceptance is in `apps/hcm/web-e2e/live/document-types.spec.ts`.
