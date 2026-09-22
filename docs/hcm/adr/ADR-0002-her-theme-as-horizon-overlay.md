# ADR-0002 — HER is a Horizon-based empFLOWyee theme overlay

Status: Accepted

## Context

empFLOWyee HCM uses UI5 Web Components for enterprise-grade Fiori controls. The product also requires distinctive HER-inspired light/dark visual palettes and tenant primary-color branding.

## Decision

HER Light and HER Dark will keep UI5 Web Components on native Horizon Light/Dark respectively.

empFLOWyee-owned surfaces use semantic `--ef-*` tokens. A narrow bridge may override documented SAP theme parameters needed for brand/emphasized states. Tenant branding supplies only a validated primary color and derived states.

## Rejected

- forking/re-skinning UI5 controls;
- shadow-DOM hacks;
- arbitrary customer CSS;
- pretending the current HER token file is a complete UI5 custom theme;
- generating a different application build per tenant/theme.

## Consequences

- Native UI5 behavior/accessibility remain maintained upstream.
- HER can evolve independently as product design tokens.
- Build-once/deploy-many remains intact.
- A future full SAP custom theme remains possible through a separate design/ADR if required.
