# HCM factory installation report

## Installed scope

- Merged factory authority, catalogue, UI, persistence and delivery requirements
  into root `AGENTS.md`, preserving the existing platform, Nx, UX, security,
  function-documentation and release rules.
- Integrated current app/launchpad metadata, factory roles, skills, workflows and
  adversarial eval scenarios. The eval Markdown is review guidance, not an
  automated security test suite.
- Added the five supplied `hcm:*` package scripts without changing dependencies
  or the lockfile. Factory tools now follow repository formatting and JSDoc rules.
- Validated 170 apps, 26 domains, 5 Spaces and 20 Pages. Extended validation to
  cover domain-owned paths and reciprocal page, role, catalogue and app references.
- Materialized 610 planned directories and regenerated the codebase map. The
  existing inventory of 38 `project.json` files is unchanged; no planned app became
  an Nx project. Existing implementation files are preserved.
- Generated local HCM-0 context and an Employee Directory context demonstrating
  missing approvals/documents. Context generation is not an implementation gate.
- Prepared the [HCM-0 work breakdown](../roadmap/HCM-0-WORK-BREAKDOWN.md), including
  dependencies, branch/commit slices, exact ownership, approval gates and evidence
  for launchpad, database, seeds, personas and app readiness.

No business app, domain table, database dependency, authentication adapter or
deployment was introduced. Shell, theme and floorplan source changes already in
the working tree were preserved and not rewritten by this installation.

## Merges and conflicts resolved

| Documents                                                           | Resolution                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HCM-AUTHORITY.md` versus root `AGENTS.md`                          | Restored platform-first authority order; current approved documents remain implementation inputs.                                                                                          |
| `GIT-DELIVERY-FOR-HCM-APPS.md` versus platform Git strategy         | Replaced rebase preference with the existing squash preference.                                                                                                                            |
| `REAL-DATA-POLICY.md` versus HCM Storybook standard                 | Retained the existing production UX workshop and its isolated deterministic fixtures; removed the suggestion that Storybook needs reintroduction.                                          |
| Compatibility specification skill/policy versus current-only prompt | Directed the compatibility entry to current approval workflows; removed instructions to infer requirements from reference phase inventories. Canonical tools ignore alternate inventories. |
| Shell `application-catalog.md` versus canonical JSON authority      | Identified TypeScript metadata as the current runtime implementation awaiting HCM-0 integration. No claim that the running launchpad already consumes the 170-app catalogue.               |
| Platform deferred runtime decisions versus HCM database strategy    | Recorded HCM's SQL-first/Kysely selection while retaining undecided Account/Console tooling and explicit migration orchestration requirements.                                             |
| Overlay root README versus maintainer-entry requirements            | Restored setup, runtime limitations, UX guidance, validation and architecture/release navigation alongside factory commands.                                                               |

The materializer guide now accurately describes its generated-map write in addition
to empty-directory creation. The app workflow uses “custom CSS forbidden by
default,” consistent with the stronger UX standard. No unresolved product decision
blocks installation; later authentication and app design gates are listed in HCM-0.

## Verification

- Catalogue validation and real workspace materialization passed; Nx project
  inventory is unchanged.
- Four Node factory tests passed: dry-run/map-only/idempotency and file preservation;
  unsafe path/provenance rejection; dangling navigation references; deterministic
  HCM-0 context, unknown inputs and missing approval indicators.
- `pnpm lint:tooling` and `pnpm architecture:check` passed.
- `pnpm docs:check`, `pnpm nx format:check --uncommitted` and `git diff --check`
  passed. Local link verification resolved 161 Markdown targets in the installation
  files; this change introduces no Mermaid diagrams.
- Affected Nx lint/test/build, selected using the root package and factory file
  list, passed across 38 projects: 66 successful tasks, with no cache hits. The
  root package change selected the full existing project graph. E2E projects were
  linted; browser E2E execution was not needed for this tooling/documentation scope.

Reproduce factory behavior checks with
`node --test tools/hcm-factory/factory.test.mjs`; reproduce the broad project
selection with `pnpm nx affected -t lint,test,build --files=package.json`.

The current checkout also contains separate shell/runtime changes. Verification
results describe this combined working tree; installation does not assert those
changes are committed, deployed or production-authentication complete.
