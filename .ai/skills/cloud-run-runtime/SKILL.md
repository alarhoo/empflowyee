# Skill: Cloud Run runtime

## Rules

- deploy exact Artifact Registry digest
- Node ingress containers listen on Cloud Run `PORT`
- bind Node listeners to `0.0.0.0`
- use runtime service accounts, not default broad identities
- use Secret Manager references for secrets
- configure startup/liveness probes deliberately
- do not put optional third-party dependency checks in liveness
- use structured stdout/stderr logging
- graceful SIGTERM is mandatory for APIs
- environment configuration changes create revisions and must be reviewed like code/infrastructure changes
