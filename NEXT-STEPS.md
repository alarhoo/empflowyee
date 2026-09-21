# Next steps

## Phase 1 — integrate and prove the runtime foundation

Completed in this checkout; all seven images passed local runtime checks. Evidence and commands are in `docs/platform/engineering/container-validation.md`. The sequence below remains the checklist for future runtime changes.

1. Install `@nx/docker` through `nx add`.
2. Generate the real project inventory.
3. Add typed Angular runtime config loading.
4. Add NestJS validated runtime config + health contract.
5. Add Next.js runtime config contract.
6. Create Dockerfiles from the supplied templates.
7. Prove `hcm-web`, `hcm-api`, and `marketing-web` locally.
8. Roll the validated pattern to the remaining four deployables.

## Phase 2 — Cloud Run Terraform module

Create one reusable module supporting:

- exact image digest
- runtime service account
- non-secret environment variables
- Secret Manager version references
- startup/liveness probes
- min/max instances
- concurrency
- CPU/memory
- ingress policy
- labels
- deletion protection policy

Deploy DEV first.

## Phase 3 — HCM shell foundation

Document and implement:

- tenant hostname context
- session/user context
- entitlements
- authorization
- application catalogue
- Spaces / Pages
- lazy-loaded feature registration
- locale/preferences

## Phase 4 — HCM theme engine + Theme Lab

Build representative dummy screens for:

- Horizon Light
- Horizon Dark
- HER Light
- HER Dark
- tenant primary-colour overlay
- logo/branding
- locale/date/time/number preferences
- Object Page
- Flexible Column layout
- list/table
- complex form
