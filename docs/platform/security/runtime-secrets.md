# Runtime secrets policy

## Source of truth

Sensitive runtime material lives in Google Secret Manager in the target environment project.

Examples:

- database passwords
- OAuth/OIDC client secrets
- SMTP/provider secrets
- signing/encryption keys
- private third-party API keys

## Cloud Run

Cloud Run service configuration references Secret Manager versions. Runtime service accounts receive only the individual `secretAccessor` permissions required by that service.

Prefer pinned secret versions for environment-variable injection. Updating a secret version is an explicit deployment/configuration change.

## GitHub

GitHub Environments contain deployment coordinates and gates, not application runtime secrets.

## Docker

Never use secrets as Docker `ARG` or `ENV` during image build. They can become part of image metadata/layers or build logs.

## Browser applications

There is no such thing as a secret shipped to browser JavaScript. Anything delivered in Angular runtime config or Next.js client output is public.
