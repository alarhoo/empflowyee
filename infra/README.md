# empFLOWyee Infrastructure

Infrastructure is managed as code.

```text
infra/
├── modules/
├── environments/
│   ├── cicd/
│   ├── dev/
│   ├── qa/
│   └── prod/
└── README.md
```

IaC owns GCP resources, IAM, WIF, service accounts, Cloud Run service configuration, runtime non-secret variables, Secret Manager resources/bindings, networking, Cloud SQL and observability.

Deploy workflows own only **which immutable container image digest is currently deployed**.
