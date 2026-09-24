# HCM-1 Role Management acceptance

The current UI revision is recorded in [Role Object Page validation](HCM-1-ROLE-OBJECT-PAGE-VALIDATION.md). The dialog-based UI evidence below describes the earlier implementation; its API regression evidence remains relevant.

Branch: `codex/hcm-1-role-management`. Depends on the committed
[access/audit foundation](HCM-1-ACCESS-AUDIT-VALIDATION.md) and the
[approved local-stage designs](../roadmap/HCM-1-IMPLEMENTATION-APPROVAL.md).

Status: implemented and browser acceptance passed on 2026-09-24. This record does not claim the remaining 19 local
apps or the six deferred integration apps are implemented.

## Delivered scope

The lazy `/access-control/role-management` screen lists persisted roles and
registered permissions. David can create, update and delete unassigned custom
roles with a reason. System roles remain read-only. Filtering, sorting and
cursor pagination belong to the server. The UI uses the existing native Dynamic
Page, UI5 Table with responsive popins, Dialog and Signal Forms; no feature CSS.

NestJS transport resolves the existing verified development session. Each Kysely
transaction rechecks the enabled account, current business grant and entitlement.
Writes require the explicitly configured local browser Origin, JSON and a UUID
idempotency key. Successful commands commit the role, safe audit event and receipt
together; stale revisions and reused keys with different bodies return conflicts.
No production authentication, credential management or new trust boundary is added.

This slice reuses migration 000006 and the business permission seed from the
foundation. API startup does not migrate or seed. Applied history is unchanged.

## Requirement execution map

The approved [traceability matrix](../apps/role-management/TRACEABILITY.md) retains
its reviewed design bytes. This separate record owns implementation evidence.

| Test                     | Executable evidence                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-ROLE-MANAGEMENT-001 | `role-management.database.spec.ts`: persisted seed roles, 209 registered permissions, safe projections and David/Jim permission separation                           |
| TEST-ROLE-MANAGEMENT-002 | Same suite: create/reload/update/delete, concurrent expected revisions, exact command replay and changed-payload conflicts                                           |
| TEST-ROLE-MANAGEMENT-003 | Same suite: system roles, flag injection, unknown permissions, unique labels and assigned-role deletion                                                              |
| TEST-ROLE-MANAGEMENT-004 | Same suite: foreign objects, Origin/media/query validation; foundation integration tests recheck disabled accounts, revoked grants and disabled entitlements         |
| TEST-ROLE-MANAGEMENT-005 | `apps/hcm/web-e2e/live/role-management.spec.ts`: real browser acceptance; runtime interceptor tests cover cancellation and suppression of obsolete persona responses |
| TEST-ROLE-MANAGEMENT-006 | Module suite: audit insertion failure rolls back role and receipt, then same-key retry succeeds; full PostgreSQL suite includes RLS and populated upgrades           |

The module suite is located at
`libs/hcm/api/access-control/module/src/lib/role-management.database.spec.ts`.
It uses real Nest routing and disposable PostgreSQL, not mocked repositories.
The browser uses the persistent local database and real APIs. Its acceptance role
is deleted through the API; the corresponding genuine audit events remain.

## Reproduction and review

1. Run `pnpm hcm:db:up` to explicitly provision or reuse the local persistent database.
2. Start `pnpm dev:hcm-api --no-watch` and `pnpm dev:hcm`. Wait for both servers to be ready.
3. Open `http://acme.localhost:4302`, select David Wallace in the profile menu,
   then search for Role Management.
4. Run `pnpm nx test hcm-api-access-control-module` for focused API/database checks,
   or `pnpm hcm:db:test` for all persistence checks.
5. Run `pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts role-management`
   for real browser acceptance. Do not edit runtime configuration during the run.

Review checks cover Nx boundaries, strict DTO projection and input validation,
SQL parameterization, tenant RLS, transactional authorization/audit/receipts,
no business fixtures, no feature theme logic, native controls and dirty navigation.
Rollback removes the consuming route/artifact while retaining additive schema and
committed audit history. There is no destructive down migration or local reset.

## Execution results

- PostgreSQL integration: 54 tests pass across seven files, including the added
  role HTTP suite and reauthorization of previously successful command receipts.
- Lint passes for all 13 affected projects and the modified launcher.

- Real browser acceptance: four tests pass. The native screen passes axe without
  excluded rules in Horizon light/dark and HER light/dark at 390, 768, 1440 and
  2560 pixels, with no horizontal viewport overflow. The create dialog also passes
  axe, Escape dismissal and focus restoration. Tenant accent application/removal,
  failed draft retention, server rejection, offline query retry and Jim's denied
  deep link pass. Screenshots are local artifacts under `.tmp/hcm-role-management/`.
- The existing live launchpad persona/responsive navigation regression passes.
- Runtime/context tests: 20 pass, including request cancellation, same-origin
  selector propagation, redirect rejection and dirty-navigation persona handling.
- All 20 admitted local apps pass exact-document readiness. Full-wave readiness
  intentionally exits 1 with 20 ready and six deferred apps blocked.
- Architecture, documentation/catalogue projection, page structure and all 15
  factory regression checks pass. API and web production builds pass.

Review caught and corrected two native-composition issues: Dynamic Page header and
footer landmarks now use UI5's supported region attributes under the global shell;
role dialogs finish closing before their contents are removed, and focus returns
only after native controls and committed list refreshes finish rendering. No deep
styling, custom theme CSS or replacement controls were introduced.

The local Nx watch executor can report recursive task invocation during rapid
file changes. `--no-watch` is the supported launcher option for a stable acceptance
run; restart that process after rebuilding. Browser acceptance used the same built
API and persisted database without file watching. This tooling issue does not
change API activation, database ownership or production authentication scope.
