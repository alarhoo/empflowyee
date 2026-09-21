# GitHub setup

## `main` ruleset

Configure:

- pull request required;
- direct push blocked;
- force push blocked;
- required checks: select the exact check contexts `Validate PR title` and `Nx affected quality` from a completed `PR CI` run;
- squash merge preferred;
- merged branches automatically deleted.

## GitHub Environments

Create `cicd`, `dev`, `qa`, `prod`.

For every environment, restrict deployment branches to the exact branch `main`
and allow no tags. Manual workflows must be dispatched from `main`, including
when deploying an older release SHA. Workflow guards supplement these environment
protections; they do not replace them or the WIF trust restrictions.

### CICD variables

```text
AR_PROJECT_ID
AR_REGION
AR_REPOSITORY
CICD_WIF_PROVIDER
CICD_BUILD_SERVICE_ACCOUNT
```

### DEV / QA / PROD variables

```text
GCP_PROJECT_ID
GCP_REGION
DEPLOY_WIF_PROVIDER
DEPLOY_SERVICE_ACCOUNT
TERRAFORM_SERVICE_ACCOUNT
TF_STATE_BUCKET
AR_PROJECT_ID
AR_REGION
AR_REPOSITORY
```

Artifact Registry coordinates point to the central CICD project.

That repository must enforce immutable Docker tags. Build and deploy identities
need permission to describe its settings and read image metadata. The build
identity also needs upload permission; environment deployers and Cloud Run service
agents need the documented cross-project image-read access. Runtime application
identities do not receive build or deployment privileges.

## Repository variable

Start with:

```text
RELEASE_PIPELINE_ENABLED=false
INFRA_PIPELINE_ENABLED=false
```

Change to `true` only after GCP infrastructure, WIF, Artifact Registry and all production Dockerfiles exist.

That activation applies to `RELEASE_PIPELINE_ENABLED`. Leave infrastructure apply
disabled until a separate Terraform identity, workflow trust and state-access
design is approved. The foundation intentionally does not create that identity.
See [GitHub-to-GCP setup](github-gcp-wif.md) for exact Terraform output mappings.

## Protection

For the current one-person team, manual workflow dispatch is the human gate. Add independent required reviewers when the team grows.

Google Secret Manager remains authoritative for runtime application secrets.

## Editor validation of reusable workflows

Local calls such as `uses: ./.github/workflows/_reusable-deploy-cloud-run.yml` resolve from the repository root. Keep the target file under `.github/workflows/` with its `workflow_call` trigger. Run `actionlint` from the root to validate paths, inputs and expressions independently of the editor.

The GitHub Actions VS Code extension can report **Unable to find reusable workflow** when it cannot associate the workspace with a GitHub repository. The inspected 0.32.3 extension derives the local file-provider root from its recognized GitHub repositories. This checkout originally had no remote; `origin` is now configured as `https://github.com/alarhoo/empflowyee.git` and GitHub access has been verified. With that repository context, the installed language server returns zero diagnostics for all 13 workflow files, including the eight reusable-workflow callers.

After adding or correcting a remote, run **Developer: Reload Window** in the VS Code window opened at this repository root. The extension's initialized language server can retain its earlier repository context until reload. If resolution still fails, verify `git remote -v`, GitHub sign-in and access to the repository in that VS Code profile. Do not change a valid workflow path or suppress validation to clear this editor diagnostic. Similar local-reference diagnostics are tracked in [the extension's issue tracker](https://github.com/github/vscode-github-actions/issues/254).
