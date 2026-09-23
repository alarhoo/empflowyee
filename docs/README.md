# empFLOWyee documentation

Documentation is the primary source of truth for empFLOWyee.

Start with the [repository README](../README.md) for setup, application URLs, repository layout and deployment diagrams. This index leads to the document that owns each rule or procedure. Placeholder product directories indicate where future specifications belong; their existence does not mean the corresponding feature is implemented.

## Reading paths

| Audience / task           | Recommended reading                                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New developer             | [README](../README.md) → [local development](platform/engineering/local-development.md) → [constitution](../AGENTS.md) → [Nx taxonomy](platform/engineering/nx/project-taxonomy.md) → [code style](platform/engineering/code-style.md)                          |
| HCM contributor           | [HCM UI decision](hcm/ux/UI-LIBRARY-DECISION.md) → [component capabilities](hcm/ux/COMPONENT-CAPABILITY-MATRIX.md) → [state/forms](platform/frontend/angular-state-and-forms.md) → [floorplans](platform/ux/floorplans/catalog.md) → the feature's FDD/TDD      |
| Release maintainer        | [CI/CD architecture](platform/engineering/cicd.md) → [release runbook](platform/engineering/release-process.md) → [concurrency](platform/engineering/workflow-concurrency.md) → [rollback](platform/engineering/rollback.md)                                    |
| Infrastructure maintainer | [Infrastructure README](../infra/README.md) → [cloud architecture](platform/architecture/gcp-cloud-foundation.md) → [Terraform operations](platform/engineering/terraform.md) → [Cloud Run ownership](platform/adr/ADR-cloud-run-terraform-ownership.md)        |
| Support engineer          | [Maintainer handbook](platform/engineering/maintenance.md) → [DEV deployment record](platform/engineering/dev-deployment.md) → [access policy](platform/security/cloud-run-access-baseline.md) → [health contract](platform/engineering/health-and-shutdown.md) |

## System and delivery references

| Topic                       | Canonical documents                                                                                                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product/runtime boundaries  | [Deployable topology](platform/architecture/deployable-topology.md), [invariants](platform/architecture/invariants.md), [data ownership](platform/architecture/data-ownership.md), [authentication boundaries](platform/architecture/authentication-boundaries.md)                                    |
| Nx organization             | [Project taxonomy](platform/engineering/nx/project-taxonomy.md), [dependency rules](platform/engineering/nx/dependency-rules.md)                                                                                                                                                                      |
| Tooling and contribution    | [Version baseline](platform/engineering/version-baseline.md), [code style](platform/engineering/code-style.md), [Git strategy](platform/engineering/git-strategy.md), [commit convention](platform/engineering/commit-convention.md), [branch protection](platform/engineering/branch-protection.md)  |
| Containers                  | [Runtime strategy ADR](platform/adr/ADR-container-runtime-strategy.md), [Nx Docker](platform/engineering/nx-docker-integration.md), [CI integration](platform/engineering/container-ci-integration.md), [validation evidence](platform/engineering/container-validation.md)                           |
| Runtime configuration       | [Angular](platform/engineering/angular-runtime-config.md), [Next.js](platform/engineering/next-runtime-config.md), [NestJS](platform/engineering/nest-container-standard.md), [health/shutdown](platform/engineering/health-and-shutdown.md), [runtime secrets](platform/security/runtime-secrets.md) |
| GitHub delivery             | [CI/CD](platform/engineering/cicd.md), [setup](platform/engineering/github-setup.md), [WIF](platform/engineering/github-gcp-wif.md), [artifact promotion](platform/engineering/artifact-promotion.md), [release runbook](platform/engineering/release-process.md)                                     |
| Google Cloud / Terraform    | [Cloud foundation](platform/architecture/gcp-cloud-foundation.md), [bootstrap](platform/engineering/gcp-bootstrap.md), [Terraform](platform/engineering/terraform.md), [Cloud Run stacks](platform/engineering/cloud-run-terraform.md), [IAM](platform/security/iam-model.md)                         |
| Current deployment evidence | [DEV readiness](platform/engineering/cloud-run-readiness.md), [DEV apps and browser access](platform/engineering/dev-deployment.md), [validation record](../VALIDATION.md)                                                                                                                            |
| Future work                 | [Next steps](../NEXT-STEPS.md), [delivery roadmap](platform/engineering/ci-cd-foundation-plan.md), [deferred cloud decisions](platform/architecture/deferred-cloud-decisions.md), [deferred runtime decisions](platform/architecture/deferred-runtime-decisions.md)                                   |

## HCM frontend milestone

The [engineering factory](hcm/engineering/AI-APP-FACTORY.md) adds canonical
[app/launchpad metadata](hcm/catalogue/HCM-APP-CATALOGUE.md),
[context/materialization tools](../tools/hcm-factory/README.md) and an
[HCM-0 work breakdown](hcm/roadmap/HCM-0-WORK-BREAKDOWN.md). The
[installation report](hcm/engineering/FACTORY-INSTALLATION-REPORT.md) distinguishes
installed tooling from planned runtime/database work. Existing UX and shell
requirements remain in force.

The [HCM index](hcm/README.md) and [production shell guide](hcm/architecture/shell/README.md)
document runtime bootstrap, library boundaries, access filtering, tests and
production-adapter prerequisites. The [shell TDD](hcm/tdd/TDD-HCM-PRODUCTION-SHELL.md)
and [UX workshop](hcm/ux/storybook.md) govern their respective implementations.
Source changes do not update the historical DEV deployment record until a release
is promoted.

## Architectural decisions

- [Product boundaries](platform/adr/ADR-0001-monorepo-product-boundaries.md)
- [Angular change-detection baseline](platform/adr/ADR-0002-angular-change-detection-baseline.md)
- [Single main, build once, promote many](platform/adr/ADR-CICD-001-single-main-build-once-promote-many.md)
- [Container runtime strategy](platform/adr/ADR-container-runtime-strategy.md)
- [Terraform and release ownership](platform/adr/ADR-cloud-run-terraform-ownership.md)
- [Direct browser access to DEV web apps](platform/adr/ADR-dev-web-browser-access.md)
- Product UI decisions: [Marketing](marketing/adr/ADR-0001-marketing-stack.md), [Account](account/adr/ADR-0001-account-ui-stack.md), [HCM](hcm/adr/ADR-0001-hcm-ui-stack.md), [Console](console/adr/ADR-0001-console-ui-stack.md)

## Product-scoped documentation

Each product owns its own documentation tree:

```text
docs/<product>/
├── product/
├── domain/
├── architecture/
├── adr/
├── fdd/
├── tdd/
└── ux/
```

Products are:

- `marketing`
- `account`
- `hcm`
- `console`

## Platform documentation

Cross-product concepts live under `docs/platform/` and must not be copied into each product tree.

Examples:

- monorepo architecture
- trust boundaries
- Nx taxonomy
- security principles
- design tokens
- UX floorplan specifications
- localization policy
- engineering standards

## Rule: one owner for each truth

If a fact is specific to HCM, document it under `docs/hcm/`.
If it governs Account, HCM, and Console, document it under `docs/platform/`.

Do not duplicate the same rule in multiple locations. Link to the canonical document.

The root README summarizes implemented behavior and links here; `.ai/` contains operating procedures rather than an alternate source of product truth. Keep summaries, Mermaid diagrams and runbooks consistent with their owning documents. The [documentation maintenance procedure](platform/engineering/maintenance.md#maintaining-documentation) defines the review and verification steps.

## FDD/TDD responsibility

- FDD: what users can do and the functional behavior/acceptance criteria.
- TDD: how the approved behavior is implemented.
- ADR: why a consequential architectural decision was made.

A feature must not silently contradict any of the three.
