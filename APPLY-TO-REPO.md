# Apply to the empFLOWyee repository

The overlay is integrated locally. Read [DEV readiness and reviewed plans](docs/platform/engineering/cloud-run-readiness.md) before a live apply.

## Toolchain and authentication

Use the Terraform version in `.terraform-version` (currently 1.16.3). It is installed in `%LOCALAPPDATA%\Programs\HashiCorp\Terraform\1.16.3` and registered in the Windows user PATH. Restart an existing terminal's host application to inherit the updated PATH. To refresh only the current PowerShell session from the repository root:

```powershell
$tfVersion = (Get-Content .terraform-version -Raw).Trim()
$env:Path = "$env:LOCALAPPDATA\Programs\HashiCorp\Terraform\$tfVersion;$env:Path"
terraform version
```

Local Application Default Credentials are now configured. Refresh them when required with `gcloud auth application-default login`; consent to the Cloud Platform permission. Never copy credentials into the repository.

## Structural and offline checks

```bash
pnpm exec node tools/cloud-run/verify-foundation.mjs
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/cloud-run/dev init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra/terraform/cloud-run/dev validate
terraform -chdir=infra/terraform/cloud-run/dev test
```

The mocked tests never apply real resources. Offline initialization does not prove that remote state or runtime service accounts exist.

## Live DEV sequence

Shared, DEV environment and DEV Cloud Run foundations are applied. All seven real images have been promoted through GitHub and verified, and fresh live plans show no changes. See [deployment evidence and URLs](docs/platform/engineering/dev-deployment.md).

Local `backend.hcl`, `terraform.tfvars` and `api-endpoints.auto.tfvars.json` files are prepared for this checkout. Do not overwrite them with examples. On a fresh checkout, copy each example only when absent, supply reviewed values, and restore the three Angular API endpoints using the instructions in the deployment record before planning. An empty endpoint map would remove deployed runtime configuration.

To repeat the DEV validation and refresh the Cloud Run plan:

```bash
terraform -chdir=infra/terraform/environments/dev output -json runtime_service_accounts
terraform -chdir=infra/terraform/cloud-run/dev init -backend-config="backend.hcl" -input=false -lockfile=readonly
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/cloud-run/dev validate
terraform -chdir=infra/terraform/cloud-run/dev plan -input=false -out="tfplan"
terraform -chdir=infra/terraform/cloud-run/dev show tfplan
```

Quote dotted filename arguments in PowerShell as shown. The Cloud Run plan rejects missing or foreign foundation identities. Review a fresh plan and coordinate with deployment runs before any apply. These commands do not apply resources or publish application images.
