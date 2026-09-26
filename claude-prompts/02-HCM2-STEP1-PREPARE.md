# Claude task — HCM-2 Step 1: prepare and finalize design

You are working in the current empFLOWyee repository. Current repository architecture and current HCM documentation are the only authority.

## Read first

1. `CLAUDE.md`
2. root `AGENTS.md`
3. `docs/hcm/roadmap/HCM-2-SCOPE.md`
4. `docs/hcm/roadmap/HCM-2-DECISIONS.md`
5. `docs/hcm/architecture/HCM-2-DATA-MODEL-INTEGRATION.md`
6. All files under:
   - `docs/hcm/domains/workforce-foundation/`
   - `docs/hcm/domains/employee/`
   - `docs/hcm/domains/job-architecture/`
7. Current canonical catalogues under `docs/hcm/catalogue/`
8. Existing HCM-0/HCM-1 database migrations and implemented domain contracts/code needed to avoid duplication.
9. Relevant `.ai/skills/` and `.ai/workflows/`, especially wave planning, FDD/TDD finalization, SQL/Kysely, contract-first, NestJS domain, UI5 feature, floorplan selection, tenant isolation, data presentation, traceability and Git workflow.

Do not search for or introduce historical implementation/version material. The HCM-2 domain documents above are already the current domain authority.

## Goal

Prepare **all HCM-2 applications** for implementation. Do not implement HCM-2 business code in this step.

### Required outcomes

1. Reconcile the detailed domain authority with the existing database spine. Reuse/evolve existing tables; do not create duplicate Person/Worker/Employment/Assignment/Organization structures.
2. Produce/finalize current FDDs for all HCM-2 apps.
3. Ask the product owner only the genuine business decisions in `HCM-2-DECISIONS.md` that block the apps being finalized. Do not invent defaults for blocking product policy.
4. After decisions are answered, finalize TDDs for all HCM-2 apps.
5. For each app, TDD must specify:
   - owning domain
   - route
   - approved floorplan and NATIVE/COMPOSED strategy
   - semantic UI5/Fundamental control choices where important
   - contracts/DTOs
   - API commands/queries
   - database tables/read models affected
   - migration/RLS/index requirements
   - Kysely repository/query ownership
   - authorization permission/scope
   - audit/security/privacy behavior
   - tests
   - Nx projects/tags/dependencies
   - branch/atomic-commit plan
6. Produce a domain implementation order that establishes shared foundations before feature apps.
7. Run the readiness tooling and report which apps are READY vs BLOCKED with exact reasons.

## UX constraints

Business implementation is theme-agnostic. Do not discuss HER/Horizon styling in individual app designs.

Use semantic controls and approved floorplans:
- link-like data -> UI5 Link
- statuses -> inverted ObjectStatus
- dates/date-times -> semantic UI5 date controls where editable
- enums -> Select/ComboBox as appropriate
- booleans -> CheckBox/Switch by meaning
- rich list/detail -> FlexibleColumnLayout + Object Page/detail
- small focused forms -> Dialog
- large/multi-section creates -> dedicated routed page
- staged processes -> Wizard/dedicated route
- no `dl/dt/dd` business-detail layouts
- no generic input where an appropriate semantic component exists
- no feature-specific theme CSS

## Data constraints

- SQL-first migrations own physical schema.
- Kysely provides typed data access.
- direct tenant scope + RLS on tenant-owned data.
- no frontend business fixtures.
- real API/DB data only.
- DB rows are never automatically public DTOs.
- Assignment owns workforce incumbency; Position does not store a person.
- reporting/position hierarchy never grants authorization.

## Stop condition

Do not start implementation until all HCM-2 app FDD/TDD readiness gates pass or the product owner explicitly narrows the wave.

When you finish, give a concise review report containing:
- finalized apps
- decisions answered
- remaining blockers
- database model/migration plan
- implementation order
- expected feature branches
- readiness result
