# DEV environment foundation

Creates only the environment-level delivery/security prerequisites:

- required Google APIs
- one GitHub deployment service account
- seven isolated Cloud Run runtime identities
- Workload Identity Federation impersonation grant
- Cloud Run deployer role
- narrowly scoped Service Account User grants
- cross-project Artifact Registry read access for the deployer and Cloud Run service agent

It intentionally does **not** create Cloud Run services or Cloud SQL yet.

## Run

```bash
cp backend.hcl.example backend.hcl
cp terraform.tfvars.example terraform.tfvars
# set the numeric github_repository_id
terraform init -backend-config=backend.hcl
terraform fmt -check
terraform validate
terraform plan -out=tfplan
terraform show tfplan
# Review the plan before applying it.
terraform apply tfplan
```

See [Terraform operations](../../../../docs/platform/engineering/terraform.md) for state ownership and offline checks. After applying, use `terraform output -json github_environment_variables` for this environment. Automated Terraform apply is not provisioned by this root.
