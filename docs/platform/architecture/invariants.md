# Architecture Invariants

These identifiers may be referenced by FDDs, TDDs, tests, reviews, and future AI evaluations.

## Repository

- **NX-001 — Thin applications:** `apps/` contains bootstrap/composition/deployment roots. Business implementation belongs in `libs/`.
- **NX-002 — Product isolation:** a product may depend only on itself and approved platform libraries.
- **NX-003 — Runtime isolation:** browser implementation does not import API implementation and vice versa.
- **NX-004 — Explicit contracts:** browser/server shared DTOs are explicit `runtime:universal` contract libraries.
- **NX-005 — No feature-to-feature imports:** reusable behavior is extracted downward rather than importing one feature library into another.
- **NX-006 — Platform is not common:** code is not moved to `libs/platform` merely because two products use similar logic.

## HCM

- **HCM-001 — Single SPA:** HCM is one Angular application with lazy-loaded Nx features.
- **HCM-002 — Navigation is not ownership:** Space/Page placement must not determine code ownership.
- **HCM-003 — Tenant hostname is not authorization:** hostname resolution supplies tenant context input; authorization must independently verify access.
- **HCM-004 — Entitlement != authorization != navigation:** these are separate decisions.

## UX

- **UX-001 — Reuse first:** use maintained library capability before building an empFLOWyee control/floorplan.
- **UX-002 — Floorplan by design:** FDD/TDD chooses the floorplan; implementation must not improvise page architecture.
- **UX-003 — Framework ownership:** HCM=Fundamental/UI5, Account=Spartan, Console=PrimeNG.
- **UX-004 — Theme accessibility:** tenant primary colors must be transformed/validated into accessible semantic tokens; tenants cannot arbitrarily override all UI colors.

## Data

- **TENANT-001 — Tenant scope:** every tenant-owned HCM operation executes in authenticated tenant context.
- **DATA-001 — No permanent soft-delete promise:** soft deletion is a lifecycle state; retention, purge, and anonymization remain supported.
