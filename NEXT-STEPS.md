# Next steps after the cloud foundation

## Phase 1 — Container and runtime configuration standard

The cloud foundation source is now present. First review and execute its [bootstrap and Terraform plans](docs/platform/engineering/gcp-bootstrap.md) in the intended account; a source commit does not prove live provisioning. Container work can proceed once those prerequisites are understood.

Create production-grade container patterns for all seven deployables:

- Angular web: account-web, hcm-web, console-web
- Next.js: marketing-web
- NestJS: account-api, hcm-api, console-api

Decide and implement:

- multi-stage Docker builds
- non-root runtime users
- Angular `/assets/config.json` runtime injection
- Next.js runtime environment handling
- NestJS runtime configuration validation
- `/health/live` and `/health/ready`
- image metadata/version labels
- local Docker Compose/dev validation where useful

## Phase 2 — Cloud Run Terraform module + first DEV deployment

- reusable Cloud Run module
- service-specific runtime identities
- environment configuration injection
- Secret Manager references
- min/max instances and concurrency
- deploy exact Artifact Registry digest

Start with DEV only.

## Phase 3 — HCM shell architecture

- tenant hostname context
- session/user context
- entitlements
- authorization
- application catalog
- Spaces / Pages
- lazy-loaded features
- locale/preferences

## Phase 4 — HCM theme engine and Theme Lab

Create the first visual/dummy implementation:

- Horizon Light
- Horizon Dark
- HER Light
- HER Dark
- tenant primary-color overlay
- tenant logo/branding
- locale/date/time/number preference controls
- representative Object Page
- Flexible Column layout
- List Report/table example
- complex form example

This becomes the proving ground for the UI architecture before business modules are implemented.
