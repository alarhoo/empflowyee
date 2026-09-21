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

## Applied foundations and reviewed service plan

| Root               | Result                                                          | Follow-up verification                                        |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `shared`           | Applied: 12 additions, 0 updates, 0 deletions                   | Fresh live plan: no changes                                   |
| `environments/dev` | Applied: 1 import, 28 additions, 1 metadata update, 0 deletions | Fresh live plan: no changes; exactly seven runtime identities |
| `cloud-run/dev`    | Planned only: 7 additions, 0 updates, 0 deletions               | Saved plan reviewed; no services applied                      |

The shared foundation owns the immutable Docker repository `asia-south1-docker.pkg.dev/empflowyee-cicd/apps`, required APIs, GitHub WIF pool/provider and builder identity. Federation requires the verified repository/owner IDs, main branch, and the approved reusable workflows/environment pairs.

The DEV foundation adopted the existing `github-deployer` account and updated only its descriptive metadata. It now owns the seven dedicated runtime accounts, Cloud Run service-agent resource, API enablement resources, scoped act-as bindings, deployment federation and central-registry read grants. No database was created; API enablement is not database provisioning.

The DEV Cloud Run plan is saved locally at `infra/terraform/cloud-run/dev/tfplan`, with human-readable output at `.tmp/cloud-run-dev-plan.txt`. It proposes seven authenticated service shells in `asia-south1`, each using its matching `${deployable}@empflowyee-dev.iam.gserviceaccount.com` identity, 1 CPU, 512 MiB memory, minimum 0 and maximum 2 instances. All use the pinned Google hello digest, HTTP startup/liveness probes and 100% latest-revision traffic. No public IAM binding is proposed. DEV currently has **zero Cloud Run services**.

Cloud Run apply was excluded from the initial foundation task. The operator has now authorized the first DEV deployment of all seven apps. Re-plan and review before applying; saved plans are time-sensitive and Git-ignored.

## Completed IAM migration

The approved migration removed only the DEV deployer's four legacy project grants: `roles/run.admin`, project-wide `roles/iam.serviceAccountUser`, `roles/artifactregistry.writer` and `roles/cloudsql.client`.

Live verification confirms:

- The deployer's only DEV project-level role is `roles/run.developer`.
- Act-as permission is granted separately on each of the seven runtime accounts.
- The deployer and DEV Cloud Run service agent have reader access to the central `apps` repository; the shared builder has writer access.
- None of the seven runtime accounts has a DEV project-level IAM grant.
- The deployer's old `github-pool` federation binding is removed. Its only federation binding now targets `github-actions/attribute.delivery_environment/1379942971:dev` in CICD project number `20790310244`.

The old DEV pool/provider were retained; removing their deployer binding was sufficient for this approved migration. No authoritative whole-project IAM replacement was used.

## Next execution sequence

1. Review the infrastructure source through the repository's PR process. Refresh the DEV Cloud Run plan, then apply the service shells only when that next step is authorized.
2. Configure GitHub `cicd` and `dev` environments with main-only branch protection and their Terraform output variables as described below.
3. Complete the release/runtime configuration handoff below before activating release builds. Publish an immutable application image through the approved CI path, manually promote one service to DEV and prove health with authenticated access.
4. Return to HCM Shell and Theme Lab design using the existing product/UX documents. Additional edge, database or authentication infrastructure is outside this validation task.

QA and PROD have only offline configuration checks; no remote initialization, plan, apply or deployment was requested for them. Keep `INFRA_PIPELINE_ENABLED` disabled pending the separate Terraform automation identity design.

## GitHub deployment handoff

The repository's existing default branch was renamed to `main` without changing its commit. Main now requires PRs and passing title/quality checks, including for administrators, and forbids force pushes/deletion. The `cicd` and `dev` environments are configured with exact-main branch policies and their applied Terraform output variables. Release builds remain disabled until the reviewed deployment source reaches main; infrastructure automation remains disabled. QA/PROD environments were not configured.

The applied foundations provide the exact non-secret environment values:

```bash
terraform -chdir=infra/terraform/shared output -json github_environment_variables
terraform -chdir=infra/terraform/environments/dev output -json github_environment_variables
```

The first output belongs to `cicd`, the second to `dev`. Both reference the central `apps` registry in Mumbai and WIF provider `projects/20790310244/locations/global/workloadIdentityPools/github-actions/providers/github`. Builder and deployer identities remain separate. Follow [GitHub setup](github-setup.md) and [the WIF variable mapping](github-gcp-wif.md); do not enable infrastructure automation or reuse the deployer as a Terraform administrator.

## Before the first real application image

The seven real Dockerfiles and local browser/API smoke checks are already complete. They must not be repeated as an unimplemented milestone.

Two configuration gaps remain between the new service-shell overlay and the working containers:

- Every real image requires `RELEASE_ID`. The Dockerfiles now expose the release build argument as an environment default, and publication smoke tests verify the exact image without a release-ID override. The first live release will verify this handoff in GCP.
- Angular also requires `API_BASE_URL`. The service roots now accept `api_base_urls`; populate the three Angular entries from the actual private DEV API service URLs after shell creation. This configuration supports the current scaffold and does not establish browser authentication or public API access.

`hcm-api` can be the first private deployment proof because it already provides `/api`, `/health/live` and `/health/ready` without external application dependencies. Its image must still receive the correct release identity. A successful Google hello shell is not evidence that the real application deployment works.

## Validation performed

All three Cloud Run roots initialize with locked Google provider 8.3.0, validate, and pass eleven plan-only mocked tests each. Tests cover seven runtime identities, environment/project/state isolation, foreign identity rejection, private invocation, latest-revision traffic, immutable bootstrap images, rejection of TCP liveness and invalid API configuration. The Google hello bootstrap digest was run locally and both configured health paths returned HTTP 200.

The existing DEV foundation's three mocked tests also pass with an explicit override for the imported deployer. Terraform formatting, workflow actionlint/ShellCheck, the structural verifier, tooling ESLint, and architecture/documentation checks pass. Credential files, backend settings, local variables and saved plans are excluded from Git.

Terraform can validate a schema without detecting every Cloud Run API restriction. HTTP liveness follows [Google's health-check documentation](https://docs.cloud.google.com/run/docs/configuring/healthchecks). Installation and remote-state setup follow [HashiCorp's installation guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli) and [GCS backend documentation](https://developer.hashicorp.com/terraform/language/backend/gcs).
