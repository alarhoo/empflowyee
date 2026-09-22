# Maintainer handbook

Use this guide to take over an existing empFLOWyee checkout, diagnose the deployed foundation and make reviewed operational changes. Start with the [repository README](../../../README.md) for applications, local setup and delivery diagrams. Commands below run from the repository root unless stated otherwise.

## Operational boundaries

The completed rollout covers `empflowyee-cicd` and `empflowyee-dev` in `asia-south1`. QA/PROD configuration exists, but their infrastructure and applications have not been rolled out through this foundation. Do not treat their checked-in roots or workflow choices as evidence that those environments are ready.

Use [DEV readiness](cloud-run-readiness.md) for applied infrastructure and [the deployment record](dev-deployment.md) for the recorded application release. Read live service metadata before a new operation; a historical SHA or revision in documentation is not a substitute for inspecting current state.

| Task                          | Required context                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Local development and tests   | Git, pinned Node/pnpm; Docker for container work                                                               |
| PR and workflow investigation | GitHub repository access; `gh auth status` verifies the CLI login                                              |
| Cloud service/log inspection  | An authorized Google account with the relevant read permissions                                                |
| Invoke a private DEV API      | Google identity token from a caller with Cloud Run invocation permission                                       |
| Terraform plan/apply          | Separately authorized operator, Application Default Credentials, correct remote backend and reviewed variables |

The image builder, deployment identity and application runtime accounts are separate. None substitutes for a Terraform administrator. Permission design is documented in [IAM](../security/iam-model.md) and [WIF](github-gcp-wif.md).

## Prepare a new maintainer's cloud checkout

### 1. Verify tools and identity

Install Terraform at the version pinned by `.terraform-version`, plus Google Cloud CLI and GitHub CLI if performing cloud/release operations. Local development alone does not need these cloud tools.

```bash
pnpm exec node --version
pnpm --version
terraform version
gcloud version
gh auth status
gcloud auth list
```

Use your own authorized identity. `gcloud auth login` authenticates CLI operations; `gcloud auth application-default login` establishes the local ADC used by Terraform. These are separate credential contexts. Neither grants missing IAM permissions. Do not copy another developer's credentials or create service-account keys to bypass access provisioning.

On the originally provisioned Windows machine, Terraform was installed under `%LOCALAPPDATA%\Programs\HashiCorp\Terraform\1.16.3`; that location is machine-specific, not a repository prerequisite. If `terraform` is missing after installation, restart the terminal host or follow [the Windows PATH note](../../../APPLY-TO-REPO.md#toolchain-and-authentication).

### 2. Reconstruct ignored configuration

The backend and variable files are intentionally absent from Git. Each Terraform root includes sanitized examples. Inspect them and copy only missing files; preserve an existing operator configuration. For the DEV Cloud Run root, PowerShell can initialize the local files without overwriting them:

```powershell
$root = 'infra/terraform/cloud-run/dev'
if (-not (Test-Path "$root/backend.hcl")) {
  Copy-Item "$root/backend.hcl.example" "$root/backend.hcl"
}
if (-not (Test-Path "$root/terraform.tfvars")) {
  Copy-Item "$root/terraform.tfvars.example" "$root/terraform.tfvars"
}
```

Confirm the project is `empflowyee-dev`, the region is `asia-south1`, the backend bucket is `empflowyee-tfstate-242771450903`, the service-state prefix is `cloud-run/dev`, and the foundation-state prefix is `environments/dev`. Obtain any additional required values from the owning root's documentation and authorized infrastructure records. Do not use DEV variables in a QA/PROD root.

Initialize the existing remote state with the committed provider lockfile:

```bash
terraform -chdir=infra/terraform/cloud-run/dev init "-backend-config=backend.hcl" -input=false -lockfile=readonly
```

For **an already deployed environment**, restore the three Angular API endpoints using [the deployment record's PowerShell procedure](dev-deployment.md#reproducing-runtime-endpoint-configuration). The resulting `api-endpoints.auto.tfvars.json` is ignored. Without it, a plan can remove the live `API_BASE_URL` values because the root's default map is empty.

This is an existing-state takeover procedure. A new environment must follow the [infrastructure dependency order](../../../infra/README.md#provisioning-order), including its seven runtime identities, before creating Cloud Run services. Do not rerun the organization bootstrap merely to configure a new developer laptop.

### 3. Establish a clean baseline

```bash
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/cloud-run/dev validate
terraform -chdir=infra/terraform/cloud-run/dev plan -input=false -detailed-exitcode
```

For `plan -detailed-exitcode`, exit code `0` means no changes, `2` means a proposed diff, and `1` means an error. Investigate an unexpected diff before applying. A clean plan proves configuration agreement at that moment; it does not verify browser behavior or API authentication.

## Inspect a deployed application

Use the exact service name from [`ci/deployables.json`](../../../ci/deployables.json). These commands inspect DEV and do not deploy:

```bash
gcloud run services list --project=empflowyee-dev --region=asia-south1
gcloud run services describe hcm-web --project=empflowyee-dev --region=asia-south1 --format=json
gcloud run services logs read hcm-web --project=empflowyee-dev --region=asia-south1 --limit=50
gh run list --repo alarhoo/empflowyee --workflow=deploy-hcm-web.yml --limit=5
```

Confirm the service URL, latest created/ready revision, traffic, container digest and runtime service account. Read logs for the affected service/revision rather than assuming every application failed for the same reason. Logs can contain operational or customer information once business functionality exists; redact them before sharing.

For an Angular web app, inspect the public configuration and health endpoints:

```powershell
$webUrl = 'https://hcm-web-bf3q2l4gtq-el.a.run.app'
Invoke-RestMethod "$webUrl/assets/config.json"
(Invoke-WebRequest "$webUrl/health/live").StatusCode
(Invoke-WebRequest "$webUrl/health/ready").StatusCode
```

Check `environment`, `releaseId` and `apiBaseUrl`. Marketing publishes metadata at `/api/runtime-config` instead. Finally open the web URL in a normal browser: verify that the page and its JavaScript/CSS load. A 200 response from a health route alone does not prove a working UI.

### Inspect a protected API

Cloud Run IAM checks apply before the API receives the request, including its health routes. Anonymous 403 is expected for the three DEV APIs. For an authorized developer, this PowerShell example keeps the identity token in memory and removes it afterward:

```powershell
$identityToken = $null
$headers = $null
try {
  $identityToken = gcloud auth print-identity-token
  if ($LASTEXITCODE -ne 0) { throw 'Google identity token unavailable' }
  $headers = @{ Authorization = "Bearer $($identityToken.Trim())" }
  Invoke-RestMethod 'https://hcm-api-bf3q2l4gtq-el.a.run.app/api' -Headers $headers
} finally {
  Remove-Variable identityToken,headers
}
```

The current response is `{"message":"Hello API"}`. Never print the token, place it in a URL, paste it into an issue or save it to source. Browser-to-API product authentication remains unimplemented; public web delivery does not make these API calls anonymous.

## Diagnose common failures

| Symptom                                                 | Investigation and corrective path                                                                                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEV web URL returns 403                                 | Confirm it is a `*-web` URL. Inspect `run.googleapis.com/invoker-iam-disabled` in service metadata and compare with the [access ADR](../adr/ADR-dev-web-browser-access.md). Reconcile through the DEV Terraform root. |
| DEV API returns 403                                     | Confirm the active caller and its invocation permission, then send a fresh identity token. Keep APIs protected until their application authentication design exists.                                                  |
| Page reports invalid runtime configuration              | Inspect `/assets/config.json` or Marketing metadata; compare environment and API URL with Terraform settings. Restore the ignored endpoint file before planning.                                                      |
| Latest revision is not ready                            | Inspect that revision's startup logs, required runtime configuration, port binding and health probes. Follow the [runtime contracts](runtime-configuration-and-secrets.md).                                           |
| Release SHA has no image for one app                    | Confirm the app was selected by that build. Choose its previously published mainline SHA or intentionally publish a new complete release; deployment never builds a missing image.                                    |
| WIF authentication fails                                | Verify dispatch from `main`, the exact GitHub Environment, reusable workflow and repository IDs. Compare with [the WIF mapping](github-gcp-wif.md); do not relax trust conditions as a workaround.                    |
| Terraform would remove API endpoint variables           | Restore `api-endpoints.auto.tfvars.json` before planning; an empty default map is not the deployed configuration.                                                                                                     |
| Terraform rejects missing or foreign runtime identities | Inspect the matching environment foundation output. Apply/import the correct foundation through its reviewed procedure; never substitute a shared identity.                                                           |
| Terraform executable cannot be found                    | Install the repository-pinned version, then verify PATH in the terminal host used by the editor.                                                                                                                      |
| Nx reports invalid regular-expression flags             | Run `pnpm install --frozen-lockfile`, check `pnpm exec node --version`, then `pnpm nx reset --onlyDaemon`. Old global Node versions can fail while importing ESLint dependencies.                                     |
| GitHub Actions editor cannot find a reusable workflow   | Open the repository root, verify `git remote -v` and GitHub access, then reload the editor window. Validate with actionlint; see [editor troubleshooting](github-setup.md#editor-validation-of-reusable-workflows).   |
| Some manually dispatched deployments were cancelled     | Dispatch sequentially and wait for each run. The environment concurrency group retains only one pending run.                                                                                                          |
| Local port is already in use                            | Inspect `docker compose -f containers/compose.local.yml ps`; stop that stack before starting development servers on the same ports.                                                                                   |

## Change infrastructure safely

Use the owning Terraform root identified in the [infrastructure README](../../../infra/README.md). Keep the change in a short-lived branch, update the applicable design and open a PR. Validate and test offline before requesting a live plan:

```bash
terraform -chdir=infra/terraform/cloud-run/dev init -backend=false -input=false -lockfile=readonly
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/cloud-run/dev validate
terraform -chdir=infra/terraform/cloud-run/dev test
```

For a checkout without an initialized backend, repeat remote initialization before a live plan. Offline validation and mock tests do not contact or apply cloud resources. Review every live diff for identities, access, state ownership, replacements, deletion and new billable resources.

Plan immediately before apply and coordinate with application deployment runs. Local Terraform is outside GitHub's concurrency lock. The [Terraform operating standard](terraform.md) describes the reviewed plan/apply sequence; [Cloud Run ownership](../adr/ADR-cloud-run-terraform-ownership.md) explains why image promotion stays separate.

Leave `INFRA_PIPELINE_ENABLED=false` until a dedicated infrastructure identity, state access and workflow trust are approved. The existing deployer is deliberately not a Terraform administrator. QA/PROD applies require separate authorization and readiness checks.

## Release and rollback support

Follow [the release runbook](release-process.md) to choose an existing artifact, dispatch the app's workflow and verify its revision and access behavior. Follow [rollback](rollback.md) to redeploy a known-good artifact without rebuilding it.

Record the environment, application, release SHA, digest, GitHub run URL, ready revision, verification result and any configuration change. A code commit, a published image and a deployed revision are distinct events. Do not describe a successful build as a completed deployment.

## Dependency and toolchain maintenance

- Keep `.node-version`, `.nvmrc` and `package.json`'s managed Node runtime synchronized.
- Keep Nx packages on the same version and run the appropriate migrations. Preserve Angular/UI-library compatibility and the Zone.js baseline.
- Update dependencies with pnpm and commit the resulting lockfile. Review resolved versions rather than editing a version table as an upgrade mechanism.
- Keep `.terraform-version` and each root's provider lockfile under review. Provider upgrades need offline tests and fresh live plans; preserve checksums needed by Windows development and Linux CI.
- After container/runtime changes, verify startup, health, configuration, embedded release identity, non-root execution and shutdown using [the container checks](container-validation.md).

The [version baseline](version-baseline.md) records the inspected framework versions. Pin files and the dependency lockfile determine what actually runs.

## Maintaining documentation

Documentation changes accompany the implementation they describe. The root README is the navigation and onboarding entry point; detailed rules have one owner under `docs/`. `.ai/` contains procedures and links, not duplicate product truth.

For each change:

1. Update the owning architecture, security, engineering or product document. Record a consequential decision in an ADR; keep FDD/TDD behavior and design consistent.
2. Update affected README summaries, commands, tables and diagrams. Use repository-relative links so they work in a clone and on GitHub.
3. Distinguish implemented behavior, planned architecture and dated deployment evidence. Do not imply QA/PROD readiness from DEV checks.
4. Document prerequisites, working directory, expected result, failure interpretation and rollback for operational commands. Mark commands that publish or mutate cloud resources.
5. Verify linked paths and heading anchors, format Markdown, and render changed Mermaid diagrams. Update JS/TS and YAML comments when their behavior changes.
6. Run `pnpm docs:check`, `pnpm architecture:check`, `pnpm nx format:check --uncommitted` and `git diff --check`. The existing documentation check verifies required files; it does not validate every link or prove that a runbook command succeeds.

Write for the next developer: explain the system and the procedure directly, without conversation history, personal machine assumptions or unsupported claims of completion.
