# CI/CD setup status

The CI/CD foundation has been integrated into this repository. Git/release rules
are in [AGENTS.md](AGENTS.md), and credential/state exclusions are in
[.gitignore](.gitignore) and [.dockerignore](.dockerignore).

## Remaining activation steps

1. Review the [accepted delivery ADR](docs/platform/adr/ADR-CICD-001-single-main-build-once-promote-many.md).
2. Configure the [GitHub ruleset, Environments and variables](docs/platform/engineering/github-setup.md).
3. Implement the [GCP bootstrap plan](docs/platform/engineering/gcp-bootstrap.md), including remote Terraform state and WIF.
4. Provision central Artifact Registry with immutable tags and the existing Cloud Run services through reviewed IaC.
5. Add and validate production Dockerfiles for all seven deployables.
6. Enable `RELEASE_PIPELINE_ENABLED=true` only after these prerequisites are verified.

Release builds never deploy automatically. Manual deploy and infrastructure
workflows run from `main` and validate prerequisites before GCP authentication.
No GCP resources or GitHub settings are provisioned by adding these files.

See [VALIDATION.md](VALIDATION.md) for local checks and their limits.
