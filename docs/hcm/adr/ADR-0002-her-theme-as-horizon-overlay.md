# ADR-0002 — HER is a Horizon-based empFLOWyee theme overlay

Status: Accepted

## Context

empFLOWyee HCM uses UI5 Web Components for enterprise-grade Fiori controls. The product also requires distinctive HER-inspired light/dark visual palettes and tenant primary-color branding.

## Decision

HER Light and HER Dark will keep UI5 Web Components on native Horizon Light/Dark respectively.

The supplied semantic `--ef-*` palette governs both product surfaces and maintained native controls. The public SAP parameter bridge covers page/header surfaces, forms, tables, tabs, text, ordinary/emphasized actions, default avatars and semantic feedback. An emphasis-only bridge is insufficient: HER must be visible on the actual UI5/Fundamental controls. Tenant branding independently supplies a validated primary color and derived accent states; it does not replace the theme surface palette.

This correction supersedes the original emphasis-only restriction. It retains the installed Horizon base assets, native control structures and behavior; it does not introduce a standalone UI5 theme package or private Shadow DOM styling.

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
