# Identity Administration — requirement traceability

Status: approved requirements implemented; execution evidence is recorded in the linked validation report.

## MATRIX

| Requirement                                                               | Design                      | Planned test                     |
| ------------------------------------------------------------------------- | --------------------------- | -------------------------------- |
| [REQ-IDENTITY-ADMINISTRATION-001](FDD.md#req-identity-administration-001) | [TDD#READ](TDD.md#read)     | TEST-IDENTITY-ADMINISTRATION-001 |
| [REQ-IDENTITY-ADMINISTRATION-002](FDD.md#req-identity-administration-002) | [TDD#ACTION](TDD.md#action) | TEST-IDENTITY-ADMINISTRATION-002 |
| [REQ-IDENTITY-ADMINISTRATION-003](FDD.md#req-identity-administration-003) | [TDD#RULES](TDD.md#rules)   | TEST-IDENTITY-ADMINISTRATION-003 |
| [REQ-IDENTITY-ADMINISTRATION-004](FDD.md#req-identity-administration-004) | [TDD#AUTH](TDD.md#auth)     | TEST-IDENTITY-ADMINISTRATION-004 |
| [REQ-IDENTITY-ADMINISTRATION-005](FDD.md#req-identity-administration-005) | [TDD#UX](TDD.md#ux)         | TEST-IDENTITY-ADMINISTRATION-005 |
| [REQ-IDENTITY-ADMINISTRATION-006](FDD.md#req-identity-administration-006) | [TDD#DATA](TDD.md#data)     | TEST-IDENTITY-ADMINISTRATION-006 |

## TEST-IDENTITY-ADMINISTRATION-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: A person can exist without an account; no automatic account is synthesized.

Assert: List real person-linked accounts without changing workforce information.

Evidence: [Identity Administration validation](../../testing/HCM-1-IDENTITY-ADMINISTRATION-VALIDATION.md). Real database API tests live in `libs/hcm/api/identity-access/module/src/lib/identity-administration.database.spec.ts`; real native browser cases live in `apps/hcm/web-e2e/live/identity-administration.spec.ts`.

## TEST-IDENTITY-ADMINISTRATION-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Foreign/missing person and case-insensitive duplicate email fail; reload verifies real persistence.

Assert: Select an existing tenant person and unique email; create enabled account with no roles, invitation or persona.

Evidence: [Identity Administration validation](../../testing/HCM-1-IDENTITY-ADMINISTRATION-VALIDATION.md). Real database API tests live in `libs/hcm/api/identity-access/module/src/lib/identity-administration.database.spec.ts`; real native browser cases live in `apps/hcm/web-e2e/live/identity-administration.spec.ts`.

## TEST-IDENTITY-ADMINISTRATION-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Disabled persona fails the next request; enabling never silently grants permissions or changes employment.

Assert: Change enabled with a reason and revision while retaining roles/history; last administrator is protected.

Evidence: [Identity Administration validation](../../testing/HCM-1-IDENTITY-ADMINISTRATION-VALIDATION.md). Real database API tests live in `libs/hcm/api/identity-access/module/src/lib/identity-administration.database.spec.ts`; real native browser cases live in `apps/hcm/web-e2e/live/identity-administration.spec.ts`.

## TEST-IDENTITY-ADMINISTRATION-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.identity-access and subject scope. Browser visibility never authorizes an action.

Evidence: [Identity Administration validation](../../testing/HCM-1-IDENTITY-ADMINISTRATION-VALIDATION.md). Real database API tests live in `libs/hcm/api/identity-access/module/src/lib/identity-administration.database.spec.ts`; real native browser cases live in `apps/hcm/web-e2e/live/identity-administration.spec.ts`.

## TEST-IDENTITY-ADMINISTRATION-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: [Identity Administration validation](../../testing/HCM-1-IDENTITY-ADMINISTRATION-VALIDATION.md). Real database API tests live in `libs/hcm/api/identity-access/module/src/lib/identity-administration.database.spec.ts`; real native browser cases live in `apps/hcm/web-e2e/live/identity-administration.spec.ts`.

## TEST-IDENTITY-ADMINISTRATION-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: [Identity Administration validation](../../testing/HCM-1-IDENTITY-ADMINISTRATION-VALIDATION.md). Real database API tests live in `libs/hcm/api/identity-access/module/src/lib/identity-administration.database.spec.ts`; real native browser cases live in `apps/hcm/web-e2e/live/identity-administration.spec.ts`.
