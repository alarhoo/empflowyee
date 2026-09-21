# CI/CD architecture

## Pull request CI

`pr-ci.yml` validates PR title, architecture, documentation, formatting, and Nx affected lint/test/build.

It also lints/tests the CI helpers and validates workflow syntax. Title edits
rerun validation. Node follows `.node-version`; pnpm follows `packageManager`.

It never authenticates to GCP and never deploys.

## Release build

`release.yml` runs after a merge/push to `main`.

It calculates affected Nx application projects, filters them to the seven deployables, builds each affected container once, pushes SHA-tagged images to central Artifact Registry, and records immutable digests.

It never deploys.

The workflow remains disabled until repository variable `RELEASE_PIPELINE_ENABLED=true`.

Manual builds run from `main` only and can select all deployables. The first commit
and changes to shared container/release inputs select all seven apps. Retrying a
release reuses published artifacts; immutable registry tags prevent replacement.
Summaries report failures and empty selections without claiming a release succeeded.

## Deployment

There is one manual entry workflow per deployable:

- deploy-marketing-web.yml
- deploy-account-web.yml
- deploy-account-api.yml
- deploy-hcm-web.yml
- deploy-hcm-api.yml
- deploy-console-web.yml
- deploy-console-api.yml

Each asks for the full release commit SHA and target DEV / QA / PROD.

All seven call `_reusable-deploy-cloud-run.yml`.

The manifest is authoritative for image names and services. Release inputs travel
as environment data to the CI helper, which uses argument arrays rather than shell
interpolation. It validates mainline ancestry before authenticating, resolves a
full SHA-256 digest, and updates an existing service's image. See the
[bootstrap prerequisites](gcp-bootstrap.md) for traffic and IaC ownership.

## Infrastructure

`infra-validate.yml` validates Terraform changes during PRs.

`infra-apply.yml` is manual and environment-gated.

It runs from `main` only and checks for a Terraform root and required variables
before authenticating. Terraform roots now live under `infra/terraform/`. PR CI validates all seven roots and runs mocked plan tests without cloud credentials. Automated apply remains guarded by `INFRA_PIPELINE_ENABLED` until a separate Terraform identity and state-access design is approved; see [Terraform operations](terraform.md).

## Why dedicated deploy entry workflows

The seven deployables share mechanics but may diverge in migrations, smoke tests, health checks and sequencing. Separate entry workflows keep each deployable visible, auditable and extensible while reusable workflows prevent copy-paste.

## GitHub workflow placement

Reusable workflows must live directly inside `.github/workflows/`; nested workflow directories are not supported.
