# IAM model

## Principles

1. No service-account JSON keys in GitHub.
2. GitHub authenticates with OIDC and Google Workload Identity Federation.
3. PR validation has no GCP credentials.
4. WIF requires the approved numeric repository/owner IDs, `main`, and the matching environment and reusable workflow. See [the canonical WIF policy](../engineering/github-gcp-wif.md).
5. Build and deployment identities are separate.
6. DEV, QA and PROD deployment identities are separate.
7. Every Cloud Run deployable receives its own runtime service account.
8. Runtime identities receive no broad project roles by default.
9. Access to application secrets is granted per secret and per runtime identity later.
10. Console, Account and HCM runtime identities are never interchangeable.

## Identities

### Shared

`github-builder@empflowyee-cicd.iam.gserviceaccount.com`

Purpose: write immutable container images to the central Artifact Registry only.

### Environment deployer

Each runtime project contains:

`github-deployer@PROJECT_ID.iam.gserviceaccount.com`

Purpose:

- deploy Cloud Run revisions
- act as the approved runtime service account for the service being deployed
- read the central Artifact Registry

### Runtime identities

Each environment receives identities for:

- marketing-web
- account-web
- account-api
- hcm-web
- hcm-api
- console-web
- console-api

They start with no application-data permissions. Permissions are introduced only when a service needs them.

Terraform administrative identities and remote-state IAM are deferred. The builder and deployment identities receive neither state-bucket access nor infrastructure administration roles.
