# CI/CD foundation status and remaining work

Status recorded on 2026-09-22. Checked items describe the completed shared/DEV foundation. QA/PROD, production hardening and unimplemented product dependencies remain separate work. Read [DEV readiness](cloud-run-readiness.md), [the deployment record](dev-deployment.md) and [the release runbook](release-process.md) before operating the system.

## Stage 1 — GitHub governance

- [x] Protect `main` and require PRs plus title/quality checks.
- [x] Configure `cicd` and `dev` GitHub Environments with exact-main branch policies and their variables.
- [x] Use squash merging for the completed foundation PRs.
- [ ] Configure and approve QA/PROD environments for rollout.

## Stage 2 — GCP bootstrap

- [x] Establish approved shared/DEV folder placement, projects and billing linkage.
- [x] Create central Artifact Registry with immutable tags.
- [x] Configure restricted WIF and separate builder/deployer identities.
- [x] Establish scoped DEV IAM and seven dedicated runtime service accounts.
- [x] Establish the protected, versioned remote state bucket and separate state prefixes.
- [ ] Complete the approved QA/PROD hierarchy and foundation rollout.
- [ ] Define and verify artifact retention against rollback requirements before production operation.

## Stage 3 — container standard

For all seven deployables:

- [x] Production Dockerfiles and non-root runtime execution.
- [x] Health endpoints, startup checks and graceful shutdown.
- [x] OCI metadata and embedded release identity.
- [x] Runtime configuration verified with two configurations of the same image.
- [x] Initial Cloud Run resource limits and scale caps.
- [ ] Application secret consumption when approved product dependencies require it.

## Stage 4 — IaC

- [x] Shared/environment/Cloud Run roots, provider locks and mocked tests.
- [x] Reusable Cloud Run service module used by all three environment configurations.
- [x] Seven live DEV services with latest-revision traffic and deployment-owned images.
- [x] Four directly accessible DEV web apps and three IAM-protected APIs.
- [x] Scoped cross-project Artifact Registry read permissions.
- [ ] Application Secret Manager bindings when required by an approved design.
- [ ] Dedicated Terraform automation identity, state access, workflow trust and apply approval flow.

## Stage 5 — enable release

`RELEASE_PIPELINE_ENABLED=true`. Completed behavior and remaining rollout checks:

- [x] Nx affected selection and explicit full-release builds.
- [x] Immutable SHA tags, digest resolution and reuse on publication retry.
- [x] Seven image smoke tests and successful manual DEV promotions.
- [x] Browser, health, runtime-configuration and protected API verification.
- [ ] Same-digest QA rollout and acceptance testing after QA readiness.
- [ ] Same-digest PROD rollout after production readiness and approval.
- [ ] Operational rollback drill using an existing known-good artifact.

Infrastructure automation remains disabled. Application publication, promotion and rollback do not grant the deployer Terraform administration rights.

## Stage 6 — hardening

Later:

- SBOM/container scanning;
- provenance/attestation;
- Nx remote cache;
- post-deploy smoke/E2E tests;
- database migration orchestration;
- canary/progressive rollout where justified.
