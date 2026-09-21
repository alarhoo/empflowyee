# Next steps after CI/CD foundation

The CI/CD design is the final major repository-foundation topic before returning to the HCM product foundation.

## Phase 1 — Bootstrap delivery infrastructure

Plan and provision:

1. GCP project layout:
   - `empflowyee-cicd`
   - `empflowyee-dev`
   - `empflowyee-qa`
   - `empflowyee-prod`
2. Artifact Registry in the CICD project.
3. GitHub OIDC / Workload Identity Federation.
4. Per-environment deployer service accounts.
5. Per-environment Cloud Run runtime service accounts.
6. Base Cloud Run services for the seven deployables.
7. Secret Manager stores.
8. Cloud SQL environment plan.
9. Terraform state strategy.
10. GitHub Environments and protection rules.

This should be documented and implemented before release workflows are enabled.

## Phase 2 — HCM UX/platform foundation

Return to the HCM architecture and produce:

- HCM shell TDD.
- tenant context.
- authenticated session/user context.
- roles and permissions.
- subscription/app entitlements.
- Application Catalog.
- Spaces / Pages / Feature registration.
- lazy-loading convention.
- localization/preferences resolver.
- HCM theme service.

## Phase 3 — Theme laboratory / dummy screens

Before implementing real HCM domains, create a documented **UX Theme Lab** using dummy data.

It should prove:

- UI5 Horizon Light.
- UI5 Horizon Dark.
- HER Light.
- HER Dark.
- runtime theme switching.
- tenant primary-color overlay.
- automatic accessible derived colors.
- logo/brand preview.
- locale/date/number/time preference switching.
- one or more approved floorplans.
- representative forms.
- representative client-side and server-style table states.
- responsive behavior.

The Theme Lab is a development/reference feature, not a customer production feature.

## Phase 4 — First real domain slice

Only after the shell and theme architecture is proven, select a representative domain feature and run the complete documentation-first lifecycle:

FDD -> TDD -> Nx libraries -> implementation -> tests -> review -> traceability.
