# Shared CI/CD Terraform

Creates the shared delivery plane in `empflowyee-cicd`:

- required APIs
- central Docker Artifact Registry repository `apps` with immutable tags and destruction protection
- GitHub Workload Identity Pool/provider
- GitHub build service account
- least-privilege Artifact Registry writer grant

The OIDC provider requires the configured repository name, numeric repository/owner IDs, `refs/heads/main`, and approved environment/workflow pairs. See [WIF setup](../../../docs/platform/engineering/github-gcp-wif.md).

## Run

```bash
cp backend.hcl.example backend.hcl
cp terraform.tfvars.example terraform.tfvars
# set github_repository, github_repository_id and github_owner_id
terraform init -backend-config=backend.hcl
terraform fmt -check
terraform validate
terraform plan -out=tfplan
terraform show tfplan
# Review the plan before applying it.
terraform apply tfplan
```

Commit neither `backend.hcl` nor `terraform.tfvars` if you choose to put local/private values in them. The example files are the committed templates.
