# Documentation Model

Documentation is the primary source of truth for empFLOWyee.

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

## FDD/TDD responsibility

- FDD: what users can do and the functional behavior/acceptance criteria.
- TDD: how the approved behavior is implemented.
- ADR: why a consequential architectural decision was made.

A feature must not silently contradict any of the three.

## Platform engineering entry points

- [Nx project taxonomy](platform/engineering/nx/project-taxonomy.md)
- [Git strategy](platform/engineering/git-strategy.md)
- [CI/CD architecture](platform/engineering/cicd.md)
- [GitHub setup](platform/engineering/github-setup.md)
- [GCP bootstrap](platform/engineering/gcp-bootstrap.md)
- [Cloud foundation](platform/architecture/gcp-cloud-foundation.md)
- [Terraform operations](platform/engineering/terraform.md)
- [GitHub federation](platform/engineering/github-gcp-wif.md)
- [Delivery ADR](platform/adr/ADR-CICD-001-single-main-build-once-promote-many.md)
