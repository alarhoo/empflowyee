# QA Cloud Run service stack

Creates seven private Cloud Run service shells in `empflowyee-qa` using the reusable module.

This stack is separate from `infra/terraform/environments/qa`, which owns WIF, deployer IAM and runtime service accounts.

Running Terraform here is a **manual infrastructure action**. A merge to `main` does not apply this stack and does not promote application releases.

Initial apply uses Google's Cloud Run hello image only as a private bootstrap image. After that, the dedicated release workflow promotes immutable empFLOWyee image digests. Terraform ignores only the container image field.

```bash
cp backend.hcl.example backend.hcl
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform fmt -check
terraform validate
terraform plan
# review before apply
terraform apply
```

Do not run this apply concurrently with a QA application deployment.
