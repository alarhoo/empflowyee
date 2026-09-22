# Additions for AGENTS.md — HCM UX

Merge these rules into the appropriate root/scoped agent instructions.

## HCM UX selection

- FDD defines user behavior and UX intent; TDD must name an approved floorplan ID.
- Prefer NATIVE maintained UI5/Fundamental components over empFLOWyee-owned implementations.
- Do not wrap a native component only to rename it or hide its API.
- Use COMPOSED floorplans only when the complete approved pattern does not exist as a maintained component.
- Custom UI behavior requires a documented capability gap.
- Verify current Fundamental NGX/UI5 APIs from installed packages or the Fundamental NGX MCP before coding. Never hallucinate component APIs.

## Floorplan boundaries

- `type:floorplan` contains reusable layout/composition only.
- Floorplans must not fetch business data.
- Floorplans must not know Employee, Leave, Payroll, Recruitment or other business domains.
- Features may consume floorplans; floorplans must never consume features.

## Storybook

- New reusable HCM UX components/floorplans require Storybook coverage.
- Stories use fake fixtures only; no real backend/network calls.
- Representative stories must be checked in Horizon Light/Dark and HER Light/Dark.
- Tenant branding changes must be demonstrated with at least one non-default primary color.

## Forms and tables

- New Angular forms use Signal Forms unless the TDD records a justified exception.
- Enterprise tables explicitly declare `client` or `server` data mode in the TDD.
- UI/table libraries do not own HTTP calls; data-access libraries do.
