# empFLOWyee infrastructure

Infrastructure is managed as code. Manual console changes are for investigation or emergency recovery only and must be reconciled back into Terraform.

## Layers

```text
bootstrap/
  one-time hierarchy + Terraform-state bootstrap

terraform/shared/
  central CI/CD plane: Artifact Registry + GitHub WIF + builder identity

terraform/environments/dev/
terraform/environments/qa/
terraform/environments/prod/
  environment IAM/API/runtime-identity foundation
```

## Apply order

```text
Stage 0 bootstrap
      ↓
shared
      ↓
dev
      ↓
qa
      ↓
prod
```

Never experiment by applying directly to PROD first.

## Future modules

These are intentionally deferred until their design decisions are made:

```text
modules/cloud-run-service
modules/cloud-sql-postgres
modules/global-load-balancer
modules/secret
modules/monitoring
```
