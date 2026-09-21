# DEV foundation readiness — 2026-09-22

## Completed locally and in GCP

- Installed repository-pinned Terraform 1.16.3 from HashiCorp's release archive, verified SHA-256, and added its versioned installation directory to the Windows user PATH.
- Authenticated local Terraform through user Application Default Credentials for the operator-confirmed `alarwind@gmail.com` account. No service-account key was created.
- Verified the user-created `empflowyee-cicd` project, number `20790310244`, belongs to organization `242771450903` and has billing enabled.
- Created `gs://empflowyee-tfstate-242771450903` in that project in `asia-south1`, with uniform bucket-level access, enforced public access prevention and object versioning.
- Initialized the remote backends for `shared`, `environments/dev` and `cloud-run/dev`. The local backend/variable files and saved plans are Git-ignored.
- Verified GitHub repository `alarhoo/empflowyee`, repository ID `1379942971`, owner ID `26132460`; populated the ignored shared/DEV variable files with those actual IDs.
- Applied the shared and DEV environment foundations after explicit operator approval and fresh plan review. Both subsequent live plans report **no changes**.
- Created the approved folders and moved only the shared and DEV projects after inspecting folder IAM and confirming no folder-specific organization-policy overrides.

| Folder path          | Folder ID      | Project placed here |
| -------------------- | -------------- | ------------------- |
| `empflowyee`         | `145087956296` | None directly       |
| `empflowyee/shared`  | `20085392682`  | `empflowyee-cicd`   |
| `empflowyee/nonprod` | `561265802296` | `empflowyee-dev`    |

The temporary organization-level `roles/resourcemanager.folderCreator` grant to the operator was removed and its absence verified. Google assigned the creating operator Folder Admin/Editor on the new folders. QA and PROD still belong directly to organization `242771450903`; neither project was moved or provisioned. The full Stage 0 bootstrap also reconciles those projects, so do not run it as an incidental DEV-only step.

## Applied foundations and services

| Root               | Result                                                              | Follow-up verification                                        |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `shared`           | Applied: 12 additions, 0 updates, 0 deletions                       | Fresh live plan: no changes                                   |
| `environments/dev` | Applied: 1 import, 28 additions, 1 metadata update, 0 deletions     | Fresh live plan: no changes; exactly seven runtime identities |
| `cloud-run/dev`    | Applied: 7 additions, then 3 API configuration updates, 0 deletions | Seven real apps deployed; fresh live plan: no changes         |

The shared foundation owns the immutable Docker repository `asia-south1-docker.pkg.dev/empflowyee-cicd/apps`, required APIs, GitHub WIF pool/provider and builder identity. Federation requires the verified repository/owner IDs, main branch, and the approved reusable workflows/environment pairs.

The DEV foundation adopted the existing `github-deployer` account and updated only its descriptive metadata. It now owns the seven dedicated runtime accounts, Cloud Run service-agent resource, API enablement resources, scoped act-as bindings, deployment federation and central-registry read grants. No database was created; API enablement is not database provisioning.

DEV has seven Cloud Run services in `asia-south1`, each using its matching `${deployable}@empflowyee-dev.iam.gserviceaccount.com` identity, 1 CPU, 512 MiB memory, minimum 0 and maximum 2 instances. The initial pinned Google hello image was replaced through the manual release workflows with each app's immutable image from release `09e146c24830720d89692194307c2cfe837dec77`. HTTP startup/liveness probes and 100% latest-revision traffic remain Terraform-owned. [ADR: DEV web browser access](../adr/ADR-dev-web-browser-access.md) configures the four web services for public browser access by disabling their invoker IAM check; the three APIs retain that check. No public IAM binding is needed.

The initial private deployment verified all seven app responses and health endpoints with authenticated HTTP requests and produced clean drift checks. It did not satisfy normal browser access. The web-access correction requires anonymous HTTP/browser checks on all four web services and continued IAM protection on the APIs. See [service URLs, revision evidence and access instructions](dev-deployment.md). Re-plan before future infrastructure changes; saved plans are time-sensitive and Git-ignored.

## Completed IAM migration

The approved migration removed only the DEV deployer's four legacy project grants: `roles/run.admin`, project-wide `roles/iam.serviceAccountUser`, `roles/artifactregistry.writer` and `roles/cloudsql.client`.

Live verification confirms:

- The deployer's only DEV project-level role is `roles/run.developer`.
- Act-as permission is granted separately on each of the seven runtime accounts.
- The deployer and DEV Cloud Run service agent have reader access to the central `apps` repository; the shared builder has writer access.
- None of the seven runtime accounts has a DEV project-level IAM grant.
- The deployer's old `github-pool` federation binding is removed. Its only federation binding now targets `github-actions/attribute.delivery_environment/1379942971:dev` in CICD project number `20790310244`.

The old DEV pool/provider were retained; removing their deployer binding was sufficient for this approved migration. No authoritative whole-project IAM replacement was used.

## Next product work

The runnable DEV foundation is complete. Return to HCM Shell and Theme Lab using the existing product/UX documents. These deployed apps are scaffolds; business workflows and browser/API authentication integration remain product/design work. Additional edge, database or authentication infrastructure is outside this deployment task.

QA and PROD have only offline configuration checks; no remote initialization, plan, apply or deployment was requested for them. Keep `INFRA_PIPELINE_ENABLED` disabled pending the separate Terraform automation identity design.

## GitHub deployment handoff

The repository's existing default branch was renamed to `main` without changing its commit. Main requires PRs and passing title/quality checks, including for administrators, and forbids force pushes/deletion. The `cicd` and `dev` environments have exact-main branch policies and their applied Terraform output variables. Release builds are enabled and proven; infrastructure automation remains disabled. QA/PROD environments were not configured.

The applied foundations provide the exact non-secret environment values:

```bash
terraform -chdir=infra/terraform/shared output -json github_environment_variables
terraform -chdir=infra/terraform/environments/dev output -json github_environment_variables
```

The first output belongs to `cicd`, the second to `dev`. Both reference the central `apps` registry in Mumbai and WIF provider `projects/20790310244/locations/global/workloadIdentityPools/github-actions/providers/github`. Builder and deployer identities remain separate. Follow [GitHub setup](github-setup.md) and [the WIF variable mapping](github-gcp-wif.md); do not enable infrastructure automation or reuse the deployer as a Terraform administrator.

## Verified runtime configuration handoff

The seven real Dockerfiles and local browser/API smoke checks are already complete. They must not be repeated as an unimplemented milestone.

The first deployment closed both configuration gaps between the service shells and real containers:

- Every real image exposes its build's `RELEASE_ID` as an environment default. Publication smoke tests verify it without an override, and live browser runtime metadata matches the published SHA.
- Terraform supplies the three Angular `API_BASE_URL` values from the actual private DEV API service URLs through `api_base_urls`. Preserve the ignored endpoint variable file on subsequent plans; the deployment record explains how to restore it on a fresh checkout. This supports the scaffold without establishing browser-to-API authentication. The web apps' public invocation policy is configured separately.

`hcm-api` was promoted first and returned its real `/api` greeting. All other deployables subsequently passed their application and health checks. None remains on the Google hello placeholder.

## Validation performed

All three Cloud Run roots initialize with locked Google provider 8.3.0 and validate. The web-access correction passes 15 DEV and 12 each QA/PROD plan-only mocked tests. Tests cover the explicit DEV web/public and API/private split, private QA/PROD services, rejection of unapproved public invocation, seven runtime identities, environment/project/state isolation, foreign identity rejection, latest-revision traffic, immutable bootstrap images, rejection of TCP liveness and invalid API configuration. The original Google hello bootstrap digest was run locally and both configured health paths returned HTTP 200.

The existing DEV foundation's three mocked tests also pass with an explicit override for the imported deployer. Terraform formatting, workflow actionlint/ShellCheck, the structural verifier, tooling ESLint, and architecture/documentation checks pass. Credential files, backend settings, local variables and saved plans are excluded from Git.

Terraform can validate a schema without detecting every Cloud Run API restriction. HTTP liveness follows [Google's health-check documentation](https://docs.cloud.google.com/run/docs/configuring/healthchecks). Installation and remote-state setup follow [HashiCorp's installation guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli) and [GCS backend documentation](https://developer.hashicorp.com/terraform/language/backend/gcs).
