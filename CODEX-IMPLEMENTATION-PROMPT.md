# Codex task — install the HCM AI Engineering Factory

Act as a senior solution architect and implementation engineer. Preserve the approved Nx architecture. Do not redesign the repository.

## Authority

Treat this repository as the complete current engineering context. Read root `AGENTS.md`, then the documents added under:

- `docs/hcm/architecture/`
- `docs/hcm/roadmap/`
- `docs/hcm/engineering/`
- `docs/hcm/catalogue/`
- `.ai/agents/`
- `.ai/skills/`
- `.ai/workflows/`
- `.ai/evals/`

Do not add historical lineage/provenance metadata to current HCM documents or catalogue entries. Current approved FDD/TDD/ADR/domain documents are the only requirements/design inputs for implementation.

## Critical UI instruction

Business apps NEVER implement themes.

When implementing Employee Directory, Leave, Payroll, etc.:

- do not import HER theme code;
- do not import Horizon theme code for feature styling;
- do not add raw brand colors;
- do not deep-style UI5 controls;
- do not add custom CSS merely to change spacing/appearance;
- use the TDD-selected approved floorplan and maintained UI5/Fundamental controls;
- bind business data/state only;
- active theme is applied globally by the HCM shell/UX foundation.

The same business feature must render under every approved global theme without feature-specific changes.

## Critical data instruction

No dummy business data in production feature code. Development sample data must be seeded into PostgreSQL and consumed through the real NestJS API and runtime-universal DTO contracts.

## Install/integrate this foundation

1. Merge documentation and AI files without deleting stronger existing current rules.
2. Merge `AGENTS-HCM-FACTORY-ADDITIONS.md` coherently into root `AGENTS.md`.
3. Treat `docs/hcm/catalogue/hcm-app-catalogue.json` and `hcm-launchpad.json` as current canonical product metadata.
4. Validate the catalogue:
   `node tools/hcm-factory/validate-catalogue.mjs`
5. Materialize the planned HCM directory tree for visualization:
   `node tools/hcm-factory/materialize-hcm-structure.mjs`
6. Important: materialized empty directories are NOT Nx projects. Do not create project.json files for all 170 apps. Actual Nx feature libraries are generated only when their approved wave/app is implemented.
7. Add package scripts only if they fit current package.json conventions.
8. Do not implement a business app in this installation task.
9. Do not create domain tables in this installation task.
10. Do not rewrite existing shell/theme/floorplan code in this task.
11. Produce a short installation report listing merges/conflicts and repository-specific adjustments.
12. Run affected Nx/ESLint/documentation checks.

## Then prepare HCM-0

Generate HCM-0 context and propose the exact work breakdown for:

- current launchpad driven entirely by the canonical catalogue;
- SQL migration runner + Kysely database foundation;
- versioned PostgreSQL development seed framework;
- development session/persona provider for authorization testing;
- app blueprint/readiness gate.

Stop before business implementation. Ask the user only for real unresolved product decisions.
