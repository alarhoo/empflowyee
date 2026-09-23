# HCM app Definition of Done

An app is complete only when all applicable checks pass:

- v3 FDD approved and acceptance criteria satisfied;
- v3 TDD approved and implemented;
- no blocking open decision remains;
- contract/DTO is explicit and version-safe;
- SQL migration and constraints are reviewed/tested;
- tenant ownership is explicit;
- RLS is implemented/tested for tenant-owned data;
- Kysely persistence uses typed queries;
- NestJS authorization is authoritative;
- API integration tests pass;
- Angular data-access consumes the API contract;
- business UI uses approved floorplan/UI5 controls;
- business UI contains no theme-specific code;
- no production feature contains fixture/dummy business arrays;
- accessibility/responsive behavior passes the floorplan contract;
- Nx boundaries pass;
- lint/format/typecheck/unit/integration/E2E pass;
- traceability IDs are synchronized;
- documentation is updated;
- feature branch contains coherent, meaningful commits;
- PR is ready for normal DEV → QA/UAT → PROD promotion process.
