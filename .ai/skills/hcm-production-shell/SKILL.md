# Skill — HCM Production Shell Change

Use this skill whenever modifying the HCM runtime shell, tenant discovery, session context, catalog, navigation access, theme/locale bootstrap or shell routing.

## Required reading

1. `AGENTS.md`
2. `docs/hcm/fdd/FDD-HCM-PRODUCTION-SHELL.md`
3. `docs/hcm/tdd/TDD-HCM-PRODUCTION-SHELL.md`
4. HCM shell ADRs
5. `docs/hcm/security/HCM-SHELL-SECURITY-INVARIANTS.md`
6. current Nx project tags/dependencies

## Procedure

1. Identify the exact shell/runtime responsibility being changed.
2. Check whether the change belongs to runtime, navigation, UX theme, authentication, or a business feature.
3. Refuse to put business-domain behavior in shell libraries.
4. Preserve authoritative backend tenant resolution.
5. Preserve separation of role, permission, entitlement and feature flag.
6. Reuse the canonical catalog for navigation and route access.
7. Keep catalog metadata independent of feature implementation.
8. Use existing HCM theme/locale services; do not duplicate them.
9. Update unit/integration tests.
10. Run affected Nx lint/test/build.
11. Update FDD/TDD/ADR if behavior or architecture changed.

## Stop conditions

Stop and propose an ADR if the change would:

- introduce a second tenant-resolution mechanism
- move authorization authority into the browser
- add localStorage token persistence
- make HCM depend on Account/Console implementation
- make the catalog import feature implementation
- replace same-origin runtime routing with a materially different auth/network topology
- conflate tenant entitlements with employee permissions
