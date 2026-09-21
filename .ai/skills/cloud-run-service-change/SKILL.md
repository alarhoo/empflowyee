# Cloud Run Service Change

Use for changes to empFLOWyee Cloud Run service Terraform.

## Read first

- `docs/platform/adr/ADR-cloud-run-terraform-ownership.md`
- `docs/platform/architecture/cloud-run-service-foundation.md`
- `docs/platform/engineering/cloud-run-terraform.md`
- `docs/platform/security/cloud-run-access-baseline.md`

## Procedure

1. Identify the deployable and target environment.
2. Confirm whether the requested change is stable infrastructure configuration or release configuration.
3. Keep application image promotion outside Terraform.
4. Preserve the dedicated runtime service account.
5. Preserve private-by-default access unless an approved edge/security design says otherwise.
6. Keep secret values out of Terraform and source control.
7. Run fmt, validate and plan.
8. Review resource/cost changes.
9. Ensure the infra workflow shares the environment concurrency lock with deploy workflows.
10. Update documentation if the runtime contract changes.

## Stop conditions

Stop for architecture review if the request introduces public access, IAP, a load balancer, VPC/Cloud SQL connectivity, new service-to-service trust, cross-environment access, shared runtime identities, or secrets in source control.
