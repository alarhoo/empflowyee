# Role Management list-detail correction

Branch: `codex/hcm-1-role-object-page`. Product-owner authorization is recorded in
[the role decisions](../apps/role-management/DECISIONS.md#ux-revision). This revision
preserves the earlier [role API acceptance](HCM-1-ROLE-MANAGEMENT-VALIDATION.md).

## Delivered behavior

Native FlexibleColumnLayout keeps the server filter/list in its begin column and
opens the selected role in a mid-column shared Object Page. Selection uses the
`role` query parameter. Overview, Permissions, Assignees and History / Audit are
native tab sections. Back to roles restores focus to the triggering list action.
On phones the native layout displays the selected detail column.

Create/edit use dedicated `new` and `:id/edit` routes with Signal Forms, native
page/footer actions, safe retry keys and dirty-leave protection. Delete/reason and
discard confirmations remain focused native dialogs. No business feature CSS,
theme imports or fixture data is added.

Assignees use the assignment-owned query service and require both role and
assignment read permissions. History uses the audit-owned projection and requires
both role and audit read permissions plus their entitlements. Its timestamps are
UTC ISO-8601; versioned cursors bind the role, sort and page size. No assignment
writer is added to Role Management. Existing role command contracts are unchanged.

## Verification

- Real PostgreSQL/Nest role suite: eight tests pass, including contextual permission
  separation, current seeded assignees, genuine audit events, strict query controls,
  role-bound pagination and the existing transactional/concurrency regressions.
- Real browser suite: five tests pass against the persistent local API/database.
  Role CRUD, dirty drafts, failed-command recovery, persona denial, all four themes,
  390/768/1440/2560px, every detail section, axe with no excluded rules, and persisted
  tenant-accent removal are covered. Screenshots: `.tmp/hcm-role-management/`.
- Affected run: 41 tasks passed. The remaining Theme Lab settings unit test
  exposed an obsolete browser-asset mock; the corrected isolated test and lint
  pass. Production web/API builds, architecture, documentation, page structure
  and factory regression checks pass.
- Shared Storybook: 16 tests pass. The workshop verifier passes 24 theme/viewport
  cases, native interactions, post-edit accessibility and in-place theme/density/
  tenant-overlay removal. Axe excludes no rules and reports zero findings.
- Full PostgreSQL regression suite: 55 tests across seven files pass.
- Exact-document readiness: all 20 admitted local apps pass. The six deferred
  production-integration apps remain outside this stage.

Run the focused API and browser commands in the earlier validation record. Start
the API with `pnpm dev:hcm-api --no-watch`; do not edit browser sources while
acceptance runs, because hot reload intentionally re-establishes the default local
persona. Build and serve Storybook, then run `pnpm nx test-storybook hcm-web` and
`node tools/ux/verify-workshop.mjs` for the shared implementation.

Review preserves tenant RLS, server authorization, domain ownership, thin app
composition and immutable applied migrations/seeds. Rollback removes consuming
routes/artifacts and retains genuine committed audit history.
