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

## Frontend UX

- Reuse maintained framework/library capabilities before creating custom components.
- Floorplans are governed by documented UX specifications and selected by FDD/TDD.
- A custom floorplan is permitted only when approved library components/compositions cannot satisfy the specification.
- HCM uses UI5/Fundamental only; Account uses Spartan only; Console uses PrimeNG only; Marketing remains independent.
- Product-specific UI frameworks must never leak across product boundaries.
- New Angular state should prefer Signals.
- New Angular forms should prefer Signal Forms unless the TDD documents a justified exception.
- RxJS remains valid for stream/concurrency use cases.

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

## Function documentation

- Every JavaScript/TypeScript function implementation must have a meaningful JSDoc description, including methods, constructors, accessors, callbacks, tests and tooling.
- Follow the authoritative scope, examples and checks in `docs/platform/engineering/code-style.md`. Update comments when behavior changes; do not bypass documentation lint rules or insert placeholder descriptions.
- AI-generated and scaffolded code must meet the same requirement before a change is complete.
- Maintained YAML also requires explanatory comments: document each file's purpose, every workflow job, and significant triggers, permissions, inputs, gates and side effects. Follow the YAML policy in `docs/platform/engineering/code-style.md`; generated lockfiles are exempt.

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
