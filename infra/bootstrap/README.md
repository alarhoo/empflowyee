# Stage 0 — GCP bootstrap

Terraform cannot store its own remote state until the state project/bucket exists. Stage 0 is therefore an intentional, minimal bootstrap exception.

It creates/reconciles:

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

It creates the CICD project if missing and the Terraform state bucket there. The DEV/QA/PROD projects must already exist in the approved organization; this is verified before any folder or project mutation.

## Prerequisites

- Google Cloud CLI installed; Git Bash/Bash 4.4+ or PowerShell available.
- You are authenticated with an identity allowed to create folders/projects, move the existing projects, link billing, and create the state bucket.
- Your active identity belongs to `alarwind-org`.

Run:

```bash
gcloud auth login
gcloud auth application-default login
gcloud billing accounts list
```

Copy `foundation.env.example` to `foundation.env` and fill only the Billing Account ID.

Then, from Git Bash:

```bash
bash infra/bootstrap/bootstrap.sh
```

Or from PowerShell:

```powershell
./infra/bootstrap/bootstrap.ps1
```

The scripts are re-runnable. CLI failures and ambiguous folder matches stop execution. Review project moves and inherited IAM/org policies before setting `BOOTSTRAP_CONFIRM=YES` or confirming interactively. Existing state buckets must belong to the CICD project and Mumbai region before their protections are reconciled.

## State bucket

Default name:

```text
empflowyee-tfstate-242771450903
```

The bucket uses:

- `asia-south1`
- uniform bucket-level access
- public access prevention
- object versioning

If the globally unique bucket name is unexpectedly unavailable, set `TF_STATE_BUCKET` in `foundation.env` to another globally unique name and use that same value in every `backend.hcl` file.

After Stage 0 completes, verify it independently:

```bash
bash infra/bootstrap/verify.sh
```

Do not continue into Terraform if verification fails.
