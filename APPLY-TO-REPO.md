# Integrating the cloud foundation

The source is integrated into this repository; no overlay copy or additional
ignore-file merge is required. Review the [cloud architecture](docs/platform/architecture/gcp-cloud-foundation.md),
[bootstrap runbook](docs/platform/engineering/gcp-bootstrap.md), and
[Terraform operating standard](docs/platform/engineering/terraform.md).

Before any live execution, supply the real billing account ID and intended GitHub
repository name plus numeric repository/owner IDs. Keep local values in the
ignored `foundation.env`, `backend.hcl`, and `terraform.tfvars` files. Commit only
their sanitized examples and provider lock files.

Bootstrap and Terraform apply change live cloud resources and require explicit
execution after plan review. Source review and offline mocked tests do not
provision or verify a live environment. See [VALIDATION.md](VALIDATION.md).
