# Claude task — finish the remaining HCM-1 local-stage item

Read `CLAUDE.md`, `AGENTS.md`, `docs/hcm/roadmap/HCM-CARRY-FORWARD.md`, the canonical HCM catalogue, the HCM-1 roadmap/readiness documents, and the existing HCM-1 implementation before changing code.

Goal: finish only the remaining admitted HCM-1 local-stage application/capability. At the snapshot review this was `DOCUMENT_REQUESTS`; verify the canonical catalogue/current implementation first rather than assuming stale status.

Requirements:

- Do not reopen or refactor completed HCM-1 apps unless the remaining app requires a shared contract fix.
- Use the already-approved FDD/TDD/blueprint/readiness evidence for the remaining app. If its readiness gate is not approved, finish the documentation/readiness first and ask only for a genuine unresolved business decision.
- Use real PostgreSQL/Kysely/NestJS data and existing domain contracts.
- Apply the semantic data-presentation and floorplan skills. No feature-specific theme work or arbitrary CSS.
- Keep apps/hcm/web and apps/hcm/api thin.
- Add focused integration/UI/E2E evidence required by the TDD.
- Update only the relevant catalogue/app documentation/traceability status.
- Run affected architecture/lint/typecheck/test/build checks.
- Make coherent, granular commits. Do not perform a full HCM-1 freeze/review cycle.

Finish by reporting: app completed, DB/API/UI changes, tests run, commits made, and any intentionally deferred production integration.
