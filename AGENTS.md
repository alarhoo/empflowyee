# empFLOWyee Engineering Constitution

This file contains universal repository rules. Detailed product, domain, UX, architecture, and technical truth belongs under `docs/`.

## Source-of-truth order

1. `docs/platform/` — cross-product platform architecture and policy.
2. `docs/<product>/` — product-specific truth.
3. ADRs — accepted architectural decisions and their rationale.
4. FDDs — functional behavior and acceptance criteria.
5. TDDs — approved implementation design.
6. Code and tests — implementation of approved design.
7. `.ai/` — procedures and orchestration only; never a duplicate source of product truth.

If sources conflict, do not silently choose one. Report the conflict and identify the documents involved.

## Non-negotiable architecture

- One Nx monorepo managed with pnpm.
- Four product boundaries: `marketing`, `account`, `hcm`, `console`.
- Seven deployables: `marketing-web`, `account-web`, `account-api`, `hcm-web`, `hcm-api`, `console-web`, `console-api`.
- Application projects are thin composition/bootstrap roots. Heavy implementation belongs in libraries.
- Product implementation libraries must not import another product's implementation libraries.
- Cross-product communication uses explicit HTTP/event contracts, not implementation imports.
- Browser code must not import server implementation code.
- Server code must not import browser implementation code.
- Shared browser/server DTOs use explicit `runtime:universal` contract libraries.
- Do not import backend entities into frontend code.
- `libs/platform` is not a dumping ground. A library belongs there only when the concept is genuinely platform-owned.

## HCM architecture

- HCM is one Angular application with lazy-loaded Nx feature libraries; it is not a microfrontend system.
- Fiori-style Spaces and Pages are UX/navigation concepts, not code ownership boundaries.
- Code is organized by stable business domain, then technical role.
- Authorization, entitlements, and navigation visibility are separate concerns.
- The HCM UI stack is Angular + Fundamental NGX/UI5 Web Components.
- Deprecated `@ui5/webcomponents-ngx` must not be introduced.

## HCM engineering factory

- The current repository is the sole implementation context. Follow the source-of-truth order above and approved current HCM requirements, FDDs, TDDs, ADRs and domain documents; do not invent unresolved business behavior.
- `docs/hcm/catalogue/hcm-app-catalogue.json` is the canonical app inventory; `docs/hcm/catalogue/hcm-launchpad.json` is the canonical navigation layout. Space/Page/Section placement never determines code ownership.
- Do not add historical provenance or migration-lineage fields to current app/domain documents or catalogue metadata.
- Business features are theme-agnostic: no HER/Horizon implementation imports, raw brand colors, deep UI5 styling or per-feature theme logic. The shell/UX foundation applies theme and tenant branding globally.
- Business UI binds data/state through the TDD-selected approved floorplan and maintained UI5/Fundamental controls. Custom CSS is forbidden by default; genuine capability gaps require TDD justification and approved shared UX ownership.
- Production business features consume real NestJS APIs through runtime-universal DTO contracts. Development business data is seeded into PostgreSQL; fixture arrays are restricted to tests, Storybook/isolated visual tooling and explicit seed tooling.
- HCM persistence is SQL-first PostgreSQL with Kysely as the typed query layer, not schema authority. One `hcm_db` uses one main `hcm` namespace containing domain-owned tables. DTOs never expose persistence rows.
- Tenant-owned data requires explicit ownership, RLS and negative cross-tenant tests. Follow `docs/hcm/architecture/DATABASE-STRATEGY.md`; migration orchestration remains explicit and never runs during ordinary API startup.
- Deliver app-by-app/domain-by-domain within approved waves, using the repository Git workflow and coherent commits. Do not implement a whole wave in one giant feature branch; squash merge remains preferred.
- Materialized empty HCM directories are visualization only. Generate real Nx libraries with approved tooling only when an approved app/domain needs them; do not generate project configuration for the full planned inventory.

## Frontend UX

- Reuse maintained framework/library capabilities before creating custom components.
- Floorplans are governed by documented UX specifications and selected by FDD/TDD.
- A custom floorplan is permitted only when approved library components/compositions cannot satisfy the specification.
- HCM uses UI5/Fundamental only; Account uses Spartan only; Console uses PrimeNG only; Marketing remains independent.
- Product-specific UI frameworks must never leak across product boundaries.
- New Angular state should prefer Signals.
- New Angular forms should prefer Signal Forms unless the TDD documents a justified exception.
- RxJS remains valid for stream/concurrency use cases.

## HCM UX composition and workshop

- Follow the platform floorplan catalog and selection standard. The TDD names the approved floorplan ID and its NATIVE or COMPOSED implementation mode.
- Inspect installed Fundamental NGX/UI5 APIs before coding. Consume native floorplans directly or through a thin empFLOWyee naming wrapper that preserves native behavior, slots and accessibility. Never imitate native controls with custom HTML/CSS.
- `type:floorplan` owns domain-agnostic layout and composition only. It may consume approved UX UI/util/contract libraries, but never features, data access or business-domain implementations.
- Reusable HCM UX additions require Storybook stories with relevant content, loading, empty, error, unavailable, read-only and action states. Verify the four Horizon/HER variants, a tenant accent and responsive sizes.
- Storybook belongs to `hcm-web`, uses deterministic fictional fixtures and never calls product APIs. Follow `docs/hcm/ux/storybook.md` and the applicable procedures under `.ai/skills/`.
- Storybook is the curated production UX catalog. Application and stories consume the same production implementation; story-only floorplan/layout implementations are prohibited. Theme Lab is exploratory and must exercise real maintained controls.
- Evaluate exact installed UI5 wrappers, Fundamental Platform and Core capabilities before composition. Absence of a component name is not proof of a capability gap. Record imports and evidence; React APIs are not Angular evidence.
- Canonical approval requires meaningful native interactions, all four themes, tenant-overlay removal, responsive and accessibility checks. A directory count or passing build does not approve a floorplan. Deferred candidates stay outside canonical discovery.
- New forms use Signal Forms. Tables declare client/server data ownership; feature/data-access code owns queries and HTTP. Follow the HCM form/table standards.
- Every HCM screen and FCL content column must use native Page, DynamicPage or an approved page-backed floorplan, with a header and optional native footer. ToolPageLayout/FCL are layout containers, not substitutes for a content page. Apply the shared centered HCM canvas (90rem maximum, responsive side gutters) once at the application/Storybook boundary. Follow `docs/hcm/ux/page-layout.md`; CI checks page headers and FCL column structure.

## Angular change detection baseline

Angular applications are initially generated with Zone.js enabled (`zoneless=false`). This is deliberate compatibility protection for third-party component ecosystems. Signals and Signal Forms remain the application state/form strategy. Moving to zoneless requires an ADR plus verified compatibility tests for all approved component libraries.

## Backend layering

Within a backend business domain, use the following roles where justified:

- `type:domain`
- `type:application`
- `type:infrastructure`
- `type:transport`
- `type:module`
- `type:contract`

Domain/application layers must not depend on HTTP/database details.

## Safety and correctness

Stop and propose an ADR before introducing:

- a new product boundary
- a new deployable
- a new cross-product implementation dependency
- a public contract breaking change
- a new architectural layer or Nx type
- a tenant isolation change
- a database ownership change
- a new authentication trust boundary

Do not invent missing business behavior.

## README and operational documentation

- Treat the root `README.md` as the developer/maintainer entry point. Keep its setup commands, status summaries, navigation links and deployment diagrams current when the implementation changes.
- Keep detailed architecture, security and operational truth under `docs/`; README files summarize and link rather than creating conflicting policies.
- Follow `docs/platform/engineering/maintenance.md#maintaining-documentation`: distinguish implemented, planned and historically verified behavior, and verify links, commands and Mermaid diagrams affected by a change.
- Write documentation for repository readers, using prerequisites, procedures and expected results rather than conversation history or assumptions about one developer's machine.

## Function documentation

- Every JavaScript/TypeScript function implementation must have a meaningful JSDoc description, including methods, constructors, accessors, callbacks, tests and tooling.
- Follow the authoritative scope, examples and checks in `docs/platform/engineering/code-style.md`. Update comments when behavior changes; do not bypass documentation lint rules or insert placeholder descriptions.
- AI-generated and scaffolded code must meet the same requirement before a change is complete.
- Format maintained HTML with the repository Prettier configuration: one attribute per line for multi-attribute tags, complete closing tags and same-line closing brackets. Do not use XML formatters for Angular templates or suppress unknown-component diagnostics with schemas.
- Maintained YAML also requires explanatory comments: document each file's purpose, every workflow job, and significant triggers, permissions, inputs, gates and side effects. Follow the YAML policy in `docs/platform/engineering/code-style.md`; generated lockfiles are exempt.

## Containers and runtime configuration

- Follow `docs/platform/adr/ADR-container-runtime-strategy.md` and the runtime-specific standards under `docs/platform/engineering/`.
- Use official Nx Docker targets and inspect actual build outputs before changing Dockerfiles.
- Browser runtime configuration is public; keep secrets in Secret Manager and environment-specific endpoints out of compiled bundles.
- Nest services must validate configuration before listening on `PORT` and `0.0.0.0`, and enable graceful shutdown.
- Health endpoints must disclose no sensitive diagnostics. Liveness must not depend on databases or external providers.
- Tenant branding, locale, entitlements and authentication setup belong to product data, not Cloud Run environment variables.
- Never run schema migrations implicitly during ordinary API startup; migration orchestration needs an explicit deployment design.
- Prove one image per runtime class locally, including two runtime configurations of the same image, before extending its pattern to the remaining deployables.

## Git and release engineering

- `main` is the only long-lived branch. All changes reach it through a pull request; never push directly to `main`.
- Use short-lived, granular branches and Conventional Commit-style PR titles. Squash merge is preferred.
- Follow `docs/platform/engineering/git-strategy.md` and `docs/platform/engineering/commit-convention.md` for branch and commit conventions.
- PR CI never deploys. Merges may build artifacts but must not deploy automatically.
- DEV, QA and PROD are environments, not branches. Promotion is explicit and manual.
- Build artifacts once; promote the same immutable image digest. Never rebuild for promotion or deploy `latest`.
- Keep runtime environment values and secrets out of compiled artifacts. Application secrets belong in Google Secret Manager; infrastructure configuration belongs in IaC; tenant configuration belongs in application data.
- Use Workload Identity Federation for GitHub-to-GCP authentication, never service-account key JSON in GitHub.
- Deployment workflows update images only. IaC owns Cloud Run configuration, IAM, environment variables and secret bindings.
- Infrastructure changes live in `infra/` and require review through a PR.
- Delivery architecture and activation prerequisites are authoritative in `docs/platform/engineering/cicd.md` and `docs/platform/engineering/github-setup.md`.
