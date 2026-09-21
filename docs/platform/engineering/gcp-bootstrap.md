# GCP bootstrap plan

## Projects

Create:

```text
empflowyee-cicd
empflowyee-dev
empflowyee-qa
empflowyee-prod
```

Projects provide IAM, quota, audit and blast-radius isolation. Resource sizing, especially stateful infrastructure, is the main cost concern; DEV and QA can be smaller.

## CICD project

Owns Artifact Registry, Workload Identity Pool/provider, CI build identity and shared delivery tooling.

## Environment projects

Each owns Cloud Run, runtime identities, Secret Manager, Cloud SQL/database resources, logging/monitoring and environment IAM.

## Workload Identity Federation

Use GitHub OIDC. Restrict trust to the empFLOWyee repository and owner IDs,
`refs/heads/main`, the intended environment, and the approved workflow identities.
Account for `job_workflow_ref` when authorizing reusable workflows. Do not grant
trust to arbitrary branch workflows in the repository.

Use separate deployer service accounts for DEV, QA and PROD. DEV deployment identity must not carry PROD permissions.

## Artifact and service prerequisites

- Enable immutable Docker tags on the central Artifact Registry repository. A
  release SHA must never be moved to another digest. Preserve tags/digests needed
  for promotion and rollback in the retention policy.
- Provision each Cloud Run service through IaC before deploying an image. The
  deployment workflow uses `gcloud run services update` and cannot create services.
- Configure services to send 100% of traffic to the latest revision. The image-only
  workflow rejects pinned revisions or split traffic; it does not change routing.
- Terraform must own runtime configuration while ignoring deployment-managed image
  changes, so a later infrastructure apply cannot silently revert a promoted image.
- Establish a remote Terraform backend with locking before adding runnable roots.
  Initial CICD project/state/WIF bootstrap is a separate reviewed bootstrap step;
  `infra-apply.yml` currently operates only on DEV/QA/PROD roots.

These are activation prerequisites, not resources already provisioned by this repository.
