# HCM Role Management

Lazy domain-owned screen using the approved native Dynamic Page, UI5 table, dialogs and Signal Forms. Server-owned filtering, sorting and cursors; custom-role commands preserve failed drafts and protect dirty navigation. System roles are read-only. No feature CSS or theme imports.

Design: [Role Management TDD](../../../../../docs/hcm/apps/role-management/TDD.md).

## Verification

`pnpm nx lint hcm-web-access-control-feature-role-management` validates this project.

Start `pnpm dev:hcm-api` and `pnpm dev:hcm`, then run
`pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts role-management`.
This uses persisted local personas and creates/deletes acceptance roles through the real API; their audit events remain.
