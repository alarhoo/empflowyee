# GCP cloud foundation

## Status

Approved foundation architecture.

## Resource hierarchy

```text
alarwind-org (242771450903)
└── empflowyee
    ├── shared
    │   └── empflowyee-cicd
    ├── nonprod
    │   ├── empflowyee-dev
    │   └── empflowyee-qa
    └── prod
        └── empflowyee-prd
```

`empflowyee-cicd` is not a runtime environment. It owns shared delivery infrastructure.

## Region

Primary region: `asia-south1` (Mumbai).

Regional services should use this region unless an ADR explicitly approves another placement.

## Environment isolation

DEV, QA and PROD use separate GCP projects. Runtime service accounts, secrets, databases and Cloud Run services must not be shared across environments.

## Shared delivery plane

`empflowyee-cicd` owns:

- Artifact Registry
- GitHub Workload Identity Federation
- CI build identity
- Terraform remote state bucket

Application images are built once and stored centrally. The exact digest is promoted to environment projects.

## DNS

Hostinger remains authoritative for `empflowyee.com`. DNS records will later point the public names and wildcard HCM hostname to the approved GCP ingress architecture.
