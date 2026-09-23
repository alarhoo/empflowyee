# HCM-0 implementation preparation

Status: factory installation, HCM0-01 catalogue launchpad and the isolated local
portion of HCM0-04 are implemented under the
[launchpad TDD](../tdd/TDD-HCM-0-LAUNCHPAD.md) and
[local-session ADR](../adr/ADR-HCM-LOCAL-DEVELOPMENT-SESSION.md). HCM0-02 supplies
the explicit migration runner and tenant query adapter under the
[database design](../tdd/TDD-HCM-0-DATABASE.md). HCM0-03 supplies the
[versioned seed framework](../tdd/TDD-HCM-0-SEEDS.md). The approved
[minimal platform spine](../domain/PLATFORM-SPINE.md) now has five SQL migrations
and four Dunder Mifflin seed modules, consumed by the
[persistent local runtime](../tdd/TDD-HCM-PERSISTENT-RUNTIME.md).
HCM0-05's [blueprint/readiness gate](../engineering/APP-READINESS.md) is implemented
with revision-bound document approvals, explicit checks and CI validation.
Further business seed modules, production database deployment and
production authentication remain planned.
The sequence below records remaining work and the original delivery slices.
HCM-0 contains no business apps, so a generated context with `count: 0` is expected.

## Context and boundaries

Generate `.tmp/hcm-factory/HCM-0.context.json` from the repository root:

```sh
pnpm hcm:catalogue:validate
pnpm hcm:wave:context --wave=HCM-0
```

Read the [authority model](../architecture/HCM-AUTHORITY.md),
[factory pipeline](../engineering/AI-APP-FACTORY.md),
[database strategy](../architecture/DATABASE-STRATEGY.md),
[real-data policy](../engineering/REAL-DATA-POLICY.md),
[production-shell TDD](../tdd/TDD-HCM-PRODUCTION-SHELL.md) and
[shell security invariants](../security/HCM-SHELL-SECURITY-INVARIANTS.md).
The canonical inventory currently has 170 planned apps, all with unfinalized
FDD/TDD status, unreviewed blockers and null route/floorplan. None is ready for
business implementation.

Existing implementation to reuse:

- `libs/hcm/web/navigation/catalog`: pure metadata and access filtering, consuming a checked canonical generated projection.
- `libs/hcm/web/runtime/context`: HTTP bootstrap, read-only Signals and route access guard.
- `libs/hcm/contracts/runtime`: runtime-universal DTOs and validation.
- `libs/hcm/api/runtime/{domain,application,infrastructure,transport,module}`: tenant/session ports, request context, policy, HTTP endpoints and composition.
- `libs/hcm/web/shell` and `libs/hcm/web/ux`: native page composition, global theme and maintained floorplans.

`HcmSessionReader` fails closed outside the explicit local launcher; the local
adapter supplies Dunder Mifflin personas through the normal session contract.
The database infrastructure libraries implement SQL-first migrations and Kysely
transactions; the [operations guide](../engineering/DATABASE-OPERATIONS.md) records their explicit commands.
The [seed framework](../engineering/DEVELOPMENT-SEEDS.md) supports explicit local
apply/reset with immutable versions. Tenant, workforce identity, accounts and discovery
grants are persisted; additional business datasets wait for their owning schemas.
Planned empty directories do not implement business behavior. Do not put business
records in frontend fixtures or invent unapproved domain schemas.

## Delivery sequence

Use one short-lived branch/PR per outcome below. Each implementation starts with
its approved FDD/TDD or technical foundation design, including exact project tags,
contracts, acceptance criteria and rollback. Keep coherent commits for review;
squash merge is preferred. All planned libraries use existing Nx types.

| ID      | Outcome and proposed branch                                         | Dependencies                                                   | Commit/review slices                                                                                           |
| ------- | ------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| HCM0-01 | Catalogue-driven launchpad, `codex/hcm-canonical-launchpad`         | Factory validation; shell design addendum                      | design and metadata mapping; pure projection; shell/router integration; regression evidence                    |
| HCM0-02 | SQL runner and Kysely foundation, `codex/hcm-database-foundation`   | Approved database technical design                             | design and Nx infrastructure libraries; SQL runner; query/transaction adapter; PostgreSQL integration evidence |
| HCM0-03 | Versioned development seed framework, `codex/hcm-development-seeds` | HCM0-02                                                        | seed manifest/design; runner and safeguards; repeatability/failure tests; maintainer procedure                 |
| HCM0-04 | Persisted development sessions, `codex/hcm-persistent-runtime`      | Accepted local-session ADR and approved minimal platform spine | SQL/seed modules; Kysely runtime adapter; API/browser isolation tests; persistent local setup                  |
| HCM0-05 | App blueprint/readiness gate, `codex/hcm-app-readiness`             | Approved evidence format; integrates prior foundation results  | design and template; context/gate CLI; negative tests; workflow integration                                    |

HCM0-01 and HCM0-02 can progress independently. HCM0-05's evidence format can be
designed first; final admission must reference the completed prerequisites. No
new deployable, cross-product implementation import or Nx type is needed.

## HCM0-01: canonical launchpad integration

1. Extend the shell design to map the canonical app code, business catalogues,
   Spaces, Pages and Sections to the existing navigation models. Use a deterministic
   generated projection or build input in `hcm-web-navigation-catalog`; retain one
   metadata authority. Do not import tooling or documents directly into browser runtime code.
2. Keep lazy imports at `apps/hcm/web/src/app/app.routes.ts`. Inventory metadata
   must not import feature implementations. Resolve existing preview/lab routes
   explicitly in the design; they are foundation tools, not extra business apps.
3. Show planned metadata as unavailable development entries only. Null routes
   must never become guessed links. Production activation requires implementation,
   approved route readiness, entitlements, permissions and feature flags.
4. Approve exact app access-policy mappings before activating any app. The
   inventory's business-role placement does not grant API permission. Preserve
   default denial, direct-route checks and removal of empty ancestors.
5. Verify all 170 identities and 5/20 hierarchy mapping, duplicate placements
   sharing one implementation, disabled planned entries, unknown routes and
   denied direct navigation. Exercise four themes, tenant-overlay removal,
   responsive layout and accessibility through maintained native pages.

Acceptance: no separately maintained business inventory in the running launchpad;
no dead production links; existing shell security behavior preserved. This work
binds metadata and state without redesigning themes, native controls or floorplans.

## HCM0-02: migration runner and typed database access

1. Specify SQL naming/order, checksums, migration history, concurrency locking,
   transactional behavior, failures, forward repair and expand/migrate/contract
   compatibility. The runner is an explicit command, never API startup behavior.
2. Generate only the necessary server infrastructure libraries under
   `libs/hcm/api/database/{migrations,kysely}` using `product:hcm`, `runtime:api`,
   `domain:database`, `type:infrastructure`. Final names and dependency directions
   are recorded in the TDD; no `type:database` or generic platform dumping ground.
3. Add reviewed Kysely/PostgreSQL dependencies with pnpm. SQL owns the schema;
   typed database mappings stay server-side and remain separate from DTOs.
4. Establish `hcm_db` / `hcm`, runner bookkeeping and distinct migration/runtime
   roles. Runtime must neither own business tables nor bypass RLS. Keep database
   credentials in server configuration/Secret Manager, never browser config.
5. Provide transaction-scoped tenant context from the existing verified request
   context. Prove missing context fails closed and pooled connections cannot leak
   context across tenants. No browser-supplied tenant ID overrides the server.
6. Test against disposable PostgreSQL: ordered apply, rerun no-op, changed applied
   SQL rejection, concurrent runners, rollback/failure recovery and pool shutdown.
   Use test-only tables for negative RLS tests; do not add business-domain schemas.

Acceptance: deterministic explicit migrations and typed tenant-aware query access
with meaningful PostgreSQL evidence. Cloud SQL provisioning and a production
migration job require separate reviewed infrastructure/deployment design and are
not implied by local success.

## HCM0-03: versioned development seeds

1. Define the seed manifest, stable IDs, dependencies, checksums, ledger and
   transactional/retry semantics under `libs/hcm/api/database/seed`.
2. Require an explicit approved development target; fail closed for production or
   unknown targets. Seed/reset is a deliberate command, never ordinary startup.
3. Use Dunder Mifflin as the canonical fictional development dataset. Domain seed
   modules are added only alongside approved domain migrations. The minimal spine
   is now populated; the runner also supports an empty manifest for isolated tooling tests.
4. Keep nonproduction tenant/session setup separate from workforce business data.
   Tests may create isolated disposable fixtures to prove behavior; production
   features later consume seeded PostgreSQL data through real Nest APIs/DTOs.
5. Verify deterministic IDs, repeated-run behavior, partial failure recovery,
   dependency order, missing migrations and environment safeguards.

Acceptance: a versioned and repeatable framework with explicit local instructions;
no production Angular fixture records. The minimal spine is implemented; business
application datasets still require their domain designs.

## HCM0-04: development authorization personas

1. Propose and approve a local-session ADR before adding an authentication trust
   boundary. Extend `HcmSessionReader` in the existing API runtime infrastructure;
   do not add a second tenant resolver or mutable browser authorization store.
2. Specify opt-in activation, loopback-only use, rejection in cloud/QA/PROD,
   expiry/revocation, trusted tenant membership and development session creation.
   If a cookie-changing endpoint is introduced, define CSRF and cookie handling
   before implementation. A local hostname or role name never grants access.
3. Approve a deterministic test matrix: unauthenticated, permitted, missing
   permission, missing entitlement, flag disabled, expired and wrong-tenant.
   Separate these authorization test inputs from unresolved business-role policies.
4. Supply the normal universal runtime contract through the real Nest runtime
   endpoints. Reuse shell Signals/access filtering; do not embed fixture principals
   in production browser code. Connect versioned seed modules only when their
   underlying tenant/session model is approved.
5. Verify API denial independently of hidden tiles and route guards, context
   refresh, expiry and cross-tenant rejection. Retain fail-closed unconfigured
   adapters when development mode is absent.

Acceptance: reproducible authorization testing through the real local API and
normal contracts, with enforced environment limits. This is not external IdP or
production sign-in implementation.

## HCM0-05: blueprint and executable readiness gate

1. Define a blueprint referencing current stable requirement/design IDs and exact
   FDD/TDD/domain documents, approvals and blocking-decision evidence.
2. Record app/domain identity, route, floorplan ID plus NATIVE/COMPOSED mode,
   native component evidence, contracts, table/read-model ownership, permissions,
   Nx projects/tags, prerequisites, tests, traceability and branch/commit plan.
3. Extend app-context with actionable missing evidence. Add an explicit check mode
   with a failing exit code for missing/unapproved documents, `BLOCKS_THIS_APP`,
   unresolved prerequisite contracts or missing required design selections.
   Catalogue flags alone never approve a document; missing evidence denies readiness.
4. Keep context generation read-only with respect to approval/catalogue state.
   `BLOCKS_LATER_CAPABILITY` is recorded without blocking an unrelated app.
5. Verify unknown app, absent docs, stale approval summaries, open blocking
   decisions, missing floorplan/route and a complete approved synthetic test case.
   Wire the approved gate into app/wave procedures and relevant CI validation.

Acceptance: a machine-checkable evidence gate plus human document review. Do not
mark any current app ready until its real requirements/design approval is present.

## Decision register

No unresolved product decision prevents this installation or preparation. The
following are gates for the later implementation PRs, not assumed approvals:

- Local session trust and persona activation follow the accepted local-session ADR; production trust remains separate.
- Per-app access mappings, titles, routes, floorplans and business behavior require
  their owning current FDD/TDD; all 170 apps remain unfinalized.
- Migration operational policy, seed safety and approval evidence format require
  reviewed technical designs. Production orchestration and cloud sizing remain
  separate from local database tooling.

Each PR must run its relevant Nx lint/test/build targets, factory checks,
architecture/documentation checks and formatting. UI integration adds native
interaction/accessibility evidence; database work adds real PostgreSQL tests.
