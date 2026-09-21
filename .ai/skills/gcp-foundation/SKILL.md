# Skill: GCP foundation change

## Use when

Changing empFLOWyee's GCP organization/project foundation, Artifact Registry, WIF, IAM, Terraform state, or environment bootstrap.

## Read first

- `docs/platform/architecture/gcp-cloud-foundation.md`
- `docs/platform/security/iam-model.md`
- `docs/platform/security/secrets-and-configuration.md`
- `docs/platform/engineering/terraform.md`

## Rules

1. Preserve project isolation between DEV, QA and PROD.
2. Do not introduce service-account JSON keys.
3. Keep GitHub OIDC/WIF restricted to the approved repository and main branch.
4. Never grant runtime service accounts broad project roles for convenience.
5. Never put application secrets in Terraform source or GitHub workflow YAML.
6. Artifact Registry remains centralized in `empflowyee-cicd` unless an ADR changes the architecture.
7. Infrastructure changes require Terraform where the resource is Terraform-managed.
8. Do not apply a new pattern to PROD before DEV/QA validation.
9. Explain IAM expansion explicitly before making it.
10. Stop if a requested change weakens tenant/environment isolation without an approved ADR.
