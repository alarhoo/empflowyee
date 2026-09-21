# Terraform operating standard

Infrastructure roots are under `infra/terraform/shared`,
`infra/terraform/environments/{dev,qa,prod}` and `infra/terraform/cloud-run/{dev,qa,prod}`. The old `infra/environments`
directories are pointers only. Use the Terraform version in `.terraform-version`
and commit each root's `.terraform.lock.hcl`.

## State and initial ownership

Remote state lives in the protected bucket in `empflowyee-cicd`. Each root uses
its own prefix: `shared`, `environments/<environment>` or `cloud-run/<environment>`.
Prefixes separate state files; they are not IAM boundaries.

Stage 0 owns folders, project placement, billing linkage and the state bucket.
Do not also declare those resources in Terraform without an explicit ownership
and import plan. The shared/environment roots own API, registry and identity resources;
Cloud Run roots own the service resources declared in their source. Existing resources require imports
before the first apply; do not recreate or overwrite their IAM blindly.

Never commit local state, plans, `backend.hcl`, `terraform.tfvars` or
`foundation.env`. Sanitized example files and provider locks are committed.
No application secrets belong in Terraform source or state.

## Local change flow

Copy the backend and variable examples inside the selected root. Supply the
intended numeric repository/owner IDs; never guess them. Initial execution uses
an authorized operator's Application Default Credentials:

```bash
terraform init -backend-config=backend.hcl -input=false
terraform fmt -check -recursive
terraform validate
terraform plan -out=tfplan
# Review the saved plan, including IAM, replacements and billable resources.
terraform show tfplan
terraform apply tfplan
```

Keep plan output local because plans can contain sensitive data. Review and apply
shared, DEV, QA, then PROD separately. Do not infer authorization for PROD from a
successful DEV apply. Emergency console changes must be reconciled into source.

Each environment root is fixed to its environment/project pair. Copying PROD
variables into DEV must fail validation.

Cloud Run roots also reject a foreign foundation prefix or a remote state missing
the matching project's seven dedicated runtime identities. Complete the shared
and environment foundations before planning Cloud Run. See the [current DEV readiness record](cloud-run-readiness.md).

## Offline review and PR checks

Without cloud credentials or an initialized remote backend:

```bash
terraform init -backend=false -input=false -lockfile=readonly
terraform fmt -check -recursive
terraform validate
terraform test
```

The tests use mocked Google providers and plan-only runs. They check immutable
artifacts, impersonation boundaries, runtime identity grants and invalid input.
They do not prove live IAM, OIDC token exchange or resource availability.

## Automated apply

The current WIF provider authorizes only the approved image-build/deploy reusable
workflows. Terraform administration and state access are deliberately excluded.
Leave `INFRA_PIPELINE_ENABLED` unset or false until the separate identity and IAM
design described in [GitHub federation](github-gcp-wif.md) is approved.
