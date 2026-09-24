# Domain Configuration — requirement traceability

Status: implemented and verified; see [validation evidence](../../testing/HCM-1-DOMAIN-CONFIGURATION-VALIDATION.md).

## MATRIX

| Requirement                                                         | Design                      | Executed test                 |
| ------------------------------------------------------------------- | --------------------------- | ----------------------------- |
| [REQ-DOMAIN-CONFIGURATION-001](FDD.md#req-domain-configuration-001) | [TDD#READ](TDD.md#read)     | TEST-DOMAIN-CONFIGURATION-001 |
| [REQ-DOMAIN-CONFIGURATION-002](FDD.md#req-domain-configuration-002) | [TDD#ACTION](TDD.md#action) | TEST-DOMAIN-CONFIGURATION-002 |
| [REQ-DOMAIN-CONFIGURATION-003](FDD.md#req-domain-configuration-003) | [TDD#RULES](TDD.md#rules)   | TEST-DOMAIN-CONFIGURATION-003 |
| [REQ-DOMAIN-CONFIGURATION-004](FDD.md#req-domain-configuration-004) | [TDD#AUTH](TDD.md#auth)     | TEST-DOMAIN-CONFIGURATION-004 |
| [REQ-DOMAIN-CONFIGURATION-005](FDD.md#req-domain-configuration-005) | [TDD#UX](TDD.md#ux)         | TEST-DOMAIN-CONFIGURATION-005 |
| [REQ-DOMAIN-CONFIGURATION-006](FDD.md#req-domain-configuration-006) | [TDD#DATA](TDD.md#data)     | TEST-DOMAIN-CONFIGURATION-006 |

## TEST-DOMAIN-CONFIGURATION-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Data matches the existing persisted tenant directory, not fabricated domain verification.

Assert: Show the exact hostnames/tenant state known to runtime with a source label.

Evidence: `libs/hcm/api/identity-access/module/src/lib/domain-projection.database.spec.ts` and `apps/hcm/web-e2e/live/domain-configuration.spec.ts`; the validation record reports executed API, isolation, failure and browser checks.

## TEST-DOMAIN-CONFIGURATION-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Mutation requests have no handler; foreign tenant selector is rejected.

Assert: No register/verify/remove DNS or tenant lifecycle controls.

Evidence: `libs/hcm/api/identity-access/module/src/lib/domain-projection.database.spec.ts` and `apps/hcm/web-e2e/live/domain-configuration.spec.ts`; the validation record reports executed API, isolation, failure and browser checks.

## TEST-DOMAIN-CONFIGURATION-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Simulate missing projection and DB failure independently; 503 is not converted to an empty success.

Assert: Missing hostname projection displays an unavailable/empty explanation and retry, not a fake configured state.

Evidence: `libs/hcm/api/identity-access/module/src/lib/domain-projection.database.spec.ts` and `apps/hcm/web-e2e/live/domain-configuration.spec.ts`; the validation record reports executed API, isolation, failure and browser checks.

## TEST-DOMAIN-CONFIGURATION-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.identity-access and subject scope. Browser visibility never authorizes an action.

Evidence: `libs/hcm/api/identity-access/module/src/lib/domain-projection.database.spec.ts` and `apps/hcm/web-e2e/live/domain-configuration.spec.ts`; the validation record reports executed API, isolation, failure and browser checks.

## TEST-DOMAIN-CONFIGURATION-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: `libs/hcm/api/identity-access/module/src/lib/domain-projection.database.spec.ts` and `apps/hcm/web-e2e/live/domain-configuration.spec.ts`; the validation record reports executed API, isolation, failure and browser checks.

## TEST-DOMAIN-CONFIGURATION-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Evidence: `libs/hcm/api/identity-access/module/src/lib/domain-projection.database.spec.ts` and `apps/hcm/web-e2e/live/domain-configuration.spec.ts`; the validation record reports executed API, isolation, failure and browser checks.
