# CI/CD foundation implementation plan

## Stage 1 — GitHub governance

- [ ] configure main ruleset;
- [ ] create CICD/DEV/QA/PROD GitHub Environments;
- [ ] configure environment variables;
- [ ] enable squash merging;
- [ ] configure required PR checks.

## Stage 2 — GCP bootstrap

- [ ] create four GCP projects;
- [ ] configure billing;
- [ ] create Artifact Registry with immutable tags and rollback retention;
- [ ] configure WIF;
- [ ] create CI/deployer/runtime service accounts;
- [ ] establish IAM;
- [ ] establish remote Terraform state with locking.

## Stage 3 — container standard

For all seven deployables:

- [ ] production Dockerfile;
- [ ] non-root runtime where feasible;
- [ ] health/readiness design;
- [ ] OCI metadata;
- [ ] runtime configuration;
- [ ] secret consumption;
- [ ] Cloud Run resource sizing.

## Stage 4 — IaC

- [ ] Terraform environment roots;
- [ ] reusable modules only after real usage proves the abstraction;
- [ ] Cloud Run services with latest-revision traffic and deployment-owned images;
- [ ] Secret Manager bindings;
- [ ] cross-project Artifact Registry read permission.

## Stage 5 — enable release

Set `RELEASE_PIPELINE_ENABLED=true`, then prove:

- [ ] affected detection;
- [ ] build only affected deployables;
- [ ] SHA image tag;
- [ ] digest resolution;
- [ ] manual DEV deploy;
- [ ] same digest QA deploy;
- [ ] same digest PROD deploy;
- [ ] rollback.

## Stage 6 — hardening

Later:

- SBOM/container scanning;
- provenance/attestation;
- Nx remote cache;
- post-deploy smoke/E2E tests;
- database migration orchestration;
- canary/progressive rollout where justified.
