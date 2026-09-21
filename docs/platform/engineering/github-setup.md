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
```

Change to `true` only after GCP infrastructure, WIF, Artifact Registry and all production Dockerfiles exist.

## Protection

For the current one-person team, manual workflow dispatch is the human gate. Add independent required reviewers when the team grows.

Google Secret Manager remains authoritative for runtime application secrets.
