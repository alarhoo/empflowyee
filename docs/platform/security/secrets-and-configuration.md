# Secrets and configuration ownership

## Git / Terraform

Store non-sensitive infrastructure and runtime defaults:

- project IDs
- region
- service names
- memory/CPU sizing
- log-level defaults
- public API hostnames

## GitHub Environments

Store deployment target metadata and approval gates, not application secrets.

## Google Secret Manager

Store sensitive runtime material per environment:

- database credentials
- OAuth/OIDC client secrets
- SMTP/provider credentials
- signing/encryption keys
- third-party API secrets

Grant access to the smallest possible runtime service account and secret.

## PostgreSQL

Tenant/customer business configuration is application data, not environment configuration. Tenant theme, branding, locale, entitlements and authentication setup belong in the product data model rather than Secret Manager or GitHub.
