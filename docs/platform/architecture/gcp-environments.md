# GCP environment architecture

```text
GitHub
   |
   | OIDC / Workload Identity Federation
   v
empflowyee-cicd
   |
   +-- Artifact Registry (immutable release images)
          |
          +-- empflowyee-dev
          +-- empflowyee-qa
          +-- empflowyee-prod
```

Each environment project hosts the seven Cloud Run deployment units independently.

All three environments read images from the central registry. Manual promotion
selects the same digest; no environment builds or republishes another's image.

DEV may run release C, QA release B and PROD release A. Promotion is artifact-based, not branch-based.
