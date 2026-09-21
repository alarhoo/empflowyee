# GitHub → GCP authentication

GitHub Actions uses OIDC and Workload Identity Federation; no service-account
private keys are stored in GitHub.

## Trust and identity separation

The shared Terraform root requires the repository name, immutable repository ID,
and immutable owner ID. The provider requires all three to match and restricts
tokens to `refs/heads/main`.

It accepts only these environment/workflow pairs:

| GitHub Environment | Reusable workflow                                | Impersonated identity |
| ------------------ | ------------------------------------------------ | --------------------- |
| `cicd`             | `_reusable-build-image.yml@refs/heads/main`      | shared builder        |
| `dev`              | `_reusable-deploy-cloud-run.yml@refs/heads/main` | DEV deployer          |
| `qa`               | `_reusable-deploy-cloud-run.yml@refs/heads/main` | QA deployer           |
| `prod`             | `_reusable-deploy-cloud-run.yml@refs/heads/main` | PROD deployer         |

Workflow paths must belong to the configured repository. Build events are push or
manual dispatch; deployment events are manual dispatch only. The IAM principal
includes both the repository ID and environment, so a DEV job cannot impersonate
the PROD deployer. PR jobs and arbitrary main-branch workflows have no cloud trust.

Configure GitHub Environment protections as described in
[GitHub setup](github-setup.md). Environment approval and branch restrictions
complement the cloud trust policy.

Obtain the IDs from the intended repository, for example:

```bash
gh api repos/OWNER/REPOSITORY --jq '{repository: .full_name, repository_id: .id, owner_id: .owner.id}'
```

This repository currently has no configured Git remote; supply the intended
repository explicitly during bootstrap. Do not copy IDs from another repository.

## Workflow variables

Use `terraform output -json github_environment_variables` in each root. The shared
output belongs to `cicd`; an environment root's output belongs only to its matching
GitHub Environment. Names match the existing workflows:

- Shared: `AR_PROJECT_ID`, `AR_REGION`, `AR_REPOSITORY`,
  `CICD_WIF_PROVIDER`, `CICD_BUILD_SERVICE_ACCOUNT`.
- DEV/QA/PROD: `GCP_PROJECT_ID`, `GCP_REGION`, `DEPLOY_WIF_PROVIDER`,
  `DEPLOY_SERVICE_ACCOUNT`, and the same three Artifact Registry coordinates.

Application secrets remain in the target project's Secret Manager.

## Terraform automation is deferred

The builder and deployer identities cannot manage Terraform resources or read
Terraform state. This foundation does not create a Terraform service account or
trust `infra-apply.yml`. Leave `INFRA_PIPELINE_ENABLED` unset or false. Initial
plans and applies use an authorized operator's local Application Default
Credentials, with plan review before every apply.

Before enabling automated infrastructure apply, review a separate Terraform
identity, workflow trust, least-privilege IAM, remote-state access and a saved-plan
approval flow. The guarded workflow is a placeholder for that approved design.
Configure `TERRAFORM_SERVICE_ACCOUNT`, `DEPLOY_WIF_PROVIDER` (or adapt the workflow
to a dedicated provider) and `TF_STATE_BUCKET` only after that design is approved.
Do not reuse a runtime deployer for infrastructure administration.

The trust conditions follow the
[Google federation guidance](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
and [GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc).
