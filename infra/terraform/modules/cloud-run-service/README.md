# Cloud Run service module

Reusable Cloud Run v2 service shell for all seven empFLOWyee deployables.

Access is private by default. `allow_unauthenticated = true` is accepted only for `marketing-web`, `account-web`, `hcm-web` and `console-web` in `empflowyee-dev`, as approved in [ADR: DEV web browser access](../../../../docs/platform/adr/ADR-dev-web-browser-access.md). Other services and environments retain IAM protection. The setting controls network invocation, not application authorization.

## Ownership boundary

Terraform owns service existence, runtime identity, resource sizing, scaling, timeout, ingress, health probes, stable runtime configuration and deletion protection.

Release workflows own the deployed immutable image digest and release/revision metadata.

The image field is deliberately ignored after initial service creation so DEV → QA → PROD promotion can move the exact same digest without Terraform rebuilding it.

## Safety rule

Never run an infrastructure apply concurrently with an application deployment in the same environment. Both workflows must use the same environment-scoped GitHub Actions concurrency group.

Never apply a saved Terraform plan after a release deployment has changed the Cloud Run service. Re-plan immediately before apply.
