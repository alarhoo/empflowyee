# ADR: Cloud Run Terraform ownership vs release ownership

## Status

Accepted

## Decision

Cloud Run has two owners with a strict boundary.

**Terraform owns stable service configuration:** service existence, project/region, runtime identity, CPU/memory, scaling, concurrency, timeout, ingress, probes, stable environment configuration, future Secret Manager references, and deletion protection.

**Release workflows own revision identity:** immutable application image digest, release metadata, and manual environment promotion.

Terraform ignores `template.containers.image` after bootstrap, plus the deployment client's descriptive `client`/`client_version` metadata. Runtime environment variables and secret bindings remain managed by Terraform.

## Why

empFLOWyee uses build-once/promote-many. The exact image digest tested in DEV must be the digest promoted to QA and PROD. Rebuilding as part of environment provisioning breaks this guarantee.

## Race-prevention rule

Terraform image-ignore patterns can become dangerous if an old infrastructure plan is applied after a newer application deployment. Therefore:

- infra apply and release deployment for the same environment use the same GitHub Actions concurrency group;
- a Terraform apply must use a fresh plan;
- do not apply a saved plan after an application release has changed Cloud Run;
- infrastructure and release changes to the same environment are serialized.

Recommended groups:

```text
cloud-run-dev
cloud-run-qa
cloud-run-prod
```

## Deferred

External HTTPS load balancing, serverless NEGs, custom domains, wildcard HCM routing, public invocation, Console IAP, Cloud SQL connectivity and service-to-service authentication are deliberately outside this module.
