# DEV Cloud Run service stack

Owns seven Cloud Run services in `empflowyee-dev`, region `asia-south1`, using the [reusable service module](../../modules/cloud-run-service/README.md). Four web apps accept ordinary HTTPS browser requests; the three APIs retain Cloud Run IAM authentication under the [DEV access decision](../../../../docs/platform/adr/ADR-dev-web-browser-access.md).

This stack is separate from [`environments/dev`](../../environments/dev/README.md), which owns deployer IAM/federation bindings and runtime service accounts. The shared root owns the WIF provider. This stack reads the environment foundation's state and rejects missing or foreign runtime identities.

Running Terraform here is a **manual infrastructure action**. A merge to `main` does not apply this stack and does not promote application releases.

Initial creation uses a pinned Google hello bootstrap image. Real application images are promoted through the dedicated release workflows. Terraform ignores subsequent image changes and deployment-client metadata; it continues to own stable runtime configuration and access. All seven DEV services already run real application images. See [deployment evidence](../../../../docs/platform/engineering/dev-deployment.md).

## Existing deployment maintenance

From the repository root, follow [new-maintainer setup](../../../../docs/platform/engineering/maintenance.md#prepare-a-new-maintainers-cloud-checkout) to configure authorized ADC, copy only missing local example files and initialize the `cloud-run/dev` backend. Do not overwrite existing `backend.hcl` or variable files.

Restore the ignored `api-endpoints.auto.tfvars.json` using the deployment record before planning. An empty `api_base_urls` map would remove the deployed Angular API settings.

```bash
terraform -chdir=infra/terraform/cloud-run/dev init "-backend-config=backend.hcl" -input=false -lockfile=readonly
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/cloud-run/dev validate
terraform -chdir=infra/terraform/cloud-run/dev plan -input=false -out=tfplan
terraform -chdir=infra/terraform/cloud-run/dev show tfplan
```

These commands prepare and display a plan; they do not apply it. Follow [Terraform operations](../../../../docs/platform/engineering/terraform.md) for reviewed apply and [workflow concurrency](../../../../docs/platform/engineering/workflow-concurrency.md) for coordination. Do not apply a stale plan or overlap an apply with a DEV application deployment.
