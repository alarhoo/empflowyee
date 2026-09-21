# GCP bootstrap runbook

Follow the approved [cloud foundation](../architecture/gcp-cloud-foundation.md).
The production environment is named `prod`; its GCP project ID is
`empflowyee-prd`.

## Stage 0 — hierarchy and remote state

The scripts in [infra/bootstrap](../../../infra/bootstrap/README.md) create the
folder hierarchy, create the CICD project if missing, reconcile the existing
DEV/QA/PROD projects, link billing, and protect the remote-state bucket.

The three runtime projects must already exist in the approved organization.
Bootstrap verifies this before creating folders or moving projects. Existing
projects outside that organization require a separate reviewed migration.
Review inherited IAM and organization policies before authorizing a folder move.

This hierarchy/state bootstrap is the explicit exception to Terraform ownership.
Do not run it merely as part of a source review.

## Stage 1 — Terraform

Initialize, validate, review a real plan, and apply each root separately:

1. `infra/terraform/shared`
2. `infra/terraform/environments/dev`
3. `infra/terraform/environments/qa`
4. `infra/terraform/environments/prod`

See the [Terraform standard](terraform.md) and
[GitHub federation setup](github-gcp-wif.md). Validate DEV/QA before PROD.

## Local setup

```bash
gcloud auth login
gcloud auth application-default login
terraform version
```

Use the Terraform version in `.terraform-version`. Do not download service-account
keys for local Terraform. GitHub infrastructure apply remains disabled pending a
separate Terraform identity and state-access design.

## Release activation prerequisites

- Central Artifact Registry enforces immutable tags; retain release digests needed
  for promotion and rollback.
- All seven production Dockerfiles must be implemented and tested.
- Provision Cloud Run services through reviewed IaC. The deployment workflow only
  updates existing services.
- Route 100% of traffic to the latest revision; image-only deployments reject pinned
  or split traffic.
- Terraform must ignore deployment-owned image changes so an infrastructure apply
  cannot revert a promoted release.
- Configure GitHub Environments and WIF from Terraform outputs, and verify the
  enabled policies in GCP before enabling release builds.

The Cloud Run module and shared/DEV foundations are applied. All seven real apps are deployed to DEV with verified health. The four web apps use the approved public browser-access configuration; the three APIs remain IAM-protected. See [the deployment record](dev-deployment.md) and [DEV readiness](cloud-run-readiness.md). Cloud SQL, production edge routing, DNS changes and application secrets remain separate work.
