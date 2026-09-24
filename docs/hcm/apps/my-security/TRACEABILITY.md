# My Security — requirement traceability

Status: implemented and verified; see [validation evidence](../../testing/HCM-1-MY-SECURITY-VALIDATION.md).

## MATRIX

| Requirement                                       | Design                      | Executed test        |
| ------------------------------------------------- | --------------------------- | -------------------- |
| [REQ-MY-SECURITY-001](FDD.md#req-my-security-001) | [TDD#READ](TDD.md#read)     | TEST-MY-SECURITY-001 |
| [REQ-MY-SECURITY-002](FDD.md#req-my-security-002) | [TDD#ACTION](TDD.md#action) | TEST-MY-SECURITY-002 |
| [REQ-MY-SECURITY-003](FDD.md#req-my-security-003) | [TDD#RULES](TDD.md#rules)   | TEST-MY-SECURITY-003 |
| [REQ-MY-SECURITY-004](FDD.md#req-my-security-004) | [TDD#AUTH](TDD.md#auth)     | TEST-MY-SECURITY-004 |
| [REQ-MY-SECURITY-005](FDD.md#req-my-security-005) | [TDD#UX](TDD.md#ux)         | TEST-MY-SECURITY-005 |
| [REQ-MY-SECURITY-006](FDD.md#req-my-security-006) | [TDD#DATA](TDD.md#data)     | TEST-MY-SECURITY-006 |

## TEST-MY-SECURITY-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Supplying another accountId is rejected; a disabled account cannot obtain a summary.

Assert: Resolve identity exclusively from verified context and show persisted account fields.

Evidence: `libs/hcm/api/identity-access/module/src/lib/my-security.database.spec.ts` and `apps/hcm/web-e2e/live/my-security.spec.ts`; see the validation record for actual executed scope.

## TEST-MY-SECURITY-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Changing a role grant changes the next load; no browser fixture role list.

Assert: Display assigned role labels and explain that role visibility is not proof of permission to every app.

Evidence: `libs/hcm/api/identity-access/module/src/lib/my-security.database.spec.ts` and `apps/hcm/web-e2e/live/my-security.spec.ts`; see the validation record for actual executed scope.

## TEST-MY-SECURITY-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: No production-session security claim and no fake Active Sessions link marked Available.

Assert: Clearly label local development persona mode; do not show working password/MFA/revoke controls.

Evidence: `libs/hcm/api/identity-access/module/src/lib/my-security.database.spec.ts` and `apps/hcm/web-e2e/live/my-security.spec.ts`; see the validation record for actual executed scope.

## TEST-MY-SECURITY-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.identity-access and subject scope. Browser visibility never authorizes an action.

Evidence: `libs/hcm/api/identity-access/module/src/lib/my-security.database.spec.ts` and `apps/hcm/web-e2e/live/my-security.spec.ts`; see the validation record for actual executed scope.

## TEST-MY-SECURITY-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: `libs/hcm/api/identity-access/module/src/lib/my-security.database.spec.ts` and `apps/hcm/web-e2e/live/my-security.spec.ts`; see the validation record for actual executed scope.

## TEST-MY-SECURITY-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Evidence: `libs/hcm/api/identity-access/module/src/lib/my-security.database.spec.ts` and `apps/hcm/web-e2e/live/my-security.spec.ts`; see the validation record for actual executed scope.
