# App Catalogue Configuration — requirement traceability

Status: implemented and verified. See [validation evidence](../../testing/HCM-1-CATALOGUE-CONFIGURATION-VALIDATION.md).

## MATRIX

| Requirement                                                                       | Design                      | Executed test                        |
| --------------------------------------------------------------------------------- | --------------------------- | ------------------------------------ |
| [REQ-APP-CATALOGUE-CONFIGURATION-001](FDD.md#req-app-catalogue-configuration-001) | [TDD#READ](TDD.md#read)     | TEST-APP-CATALOGUE-CONFIGURATION-001 |
| [REQ-APP-CATALOGUE-CONFIGURATION-002](FDD.md#req-app-catalogue-configuration-002) | [TDD#ACTION](TDD.md#action) | TEST-APP-CATALOGUE-CONFIGURATION-002 |
| [REQ-APP-CATALOGUE-CONFIGURATION-003](FDD.md#req-app-catalogue-configuration-003) | [TDD#RULES](TDD.md#rules)   | TEST-APP-CATALOGUE-CONFIGURATION-003 |
| [REQ-APP-CATALOGUE-CONFIGURATION-004](FDD.md#req-app-catalogue-configuration-004) | [TDD#AUTH](TDD.md#auth)     | TEST-APP-CATALOGUE-CONFIGURATION-004 |
| [REQ-APP-CATALOGUE-CONFIGURATION-005](FDD.md#req-app-catalogue-configuration-005) | [TDD#UX](TDD.md#ux)         | TEST-APP-CATALOGUE-CONFIGURATION-005 |
| [REQ-APP-CATALOGUE-CONFIGURATION-006](FDD.md#req-app-catalogue-configuration-006) | [TDD#DATA](TDD.md#data)     | TEST-APP-CATALOGUE-CONFIGURATION-006 |

## TEST-APP-CATALOGUE-CONFIGURATION-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify 170 entries against the canonical generated projection, not hand-maintained business arrays.

Assert: Show the full current canonical metadata with tenant entitlement projection; Planned and Available are distinct.

Evidence: `libs/hcm/api/access-control/module/src/lib/catalogue-inspection.database.spec.ts` and `apps/hcm/web-e2e/live/catalogue-configuration.spec.ts`; see the linked validation record for executed cases and limitations.

## TEST-APP-CATALOGUE-CONFIGURATION-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Changing the selected account updates only the explanation and never impersonates it.

Assert: Optionally choose a tenant account and inspect effective discovery reasons from server grants and entitlements.

Evidence: `libs/hcm/api/access-control/module/src/lib/catalogue-inspection.database.spec.ts` and `apps/hcm/web-e2e/live/catalogue-configuration.spec.ts`; see the linked validation record for executed cases and limitations.

## TEST-APP-CATALOGUE-CONFIGURATION-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Attempt mutation methods and tenant/account injection; no corresponding transport mutation exists.

Assert: No UI/API edits to catalogue routes, placements, implementation status or Account-owned entitlements.

Evidence: `libs/hcm/api/access-control/module/src/lib/catalogue-inspection.database.spec.ts` and `apps/hcm/web-e2e/live/catalogue-configuration.spec.ts`; see the linked validation record for executed cases and limitations.

## TEST-APP-CATALOGUE-CONFIGURATION-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.access-control and subject scope. Browser visibility never authorizes an action.

Evidence: `libs/hcm/api/access-control/module/src/lib/catalogue-inspection.database.spec.ts` and `apps/hcm/web-e2e/live/catalogue-configuration.spec.ts`; see the linked validation record for executed cases and limitations.

## TEST-APP-CATALOGUE-CONFIGURATION-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: `libs/hcm/api/access-control/module/src/lib/catalogue-inspection.database.spec.ts` and `apps/hcm/web-e2e/live/catalogue-configuration.spec.ts`; see the linked validation record for executed cases and limitations.

## TEST-APP-CATALOGUE-CONFIGURATION-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Evidence: `libs/hcm/api/access-control/module/src/lib/catalogue-inspection.database.spec.ts` and `apps/hcm/web-e2e/live/catalogue-configuration.spec.ts`; see the linked validation record for executed cases and limitations.
