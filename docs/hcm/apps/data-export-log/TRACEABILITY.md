# Data Export Log — requirement traceability

Status: implemented for the approved closed export registry; see [validation evidence and producer limits](../../testing/HCM-1-DATA-EXPORT-LOG-VALIDATION.md).

## MATRIX

| Requirement                                               | Design                      | Executed test            |
| --------------------------------------------------------- | --------------------------- | ------------------------ |
| [REQ-DATA-EXPORT-LOG-001](FDD.md#req-data-export-log-001) | [TDD#READ](TDD.md#read)     | TEST-DATA-EXPORT-LOG-001 |
| [REQ-DATA-EXPORT-LOG-002](FDD.md#req-data-export-log-002) | [TDD#ACTION](TDD.md#action) | TEST-DATA-EXPORT-LOG-002 |
| [REQ-DATA-EXPORT-LOG-003](FDD.md#req-data-export-log-003) | [TDD#RULES](TDD.md#rules)   | TEST-DATA-EXPORT-LOG-003 |
| [REQ-DATA-EXPORT-LOG-004](FDD.md#req-data-export-log-004) | [TDD#AUTH](TDD.md#auth)     | TEST-DATA-EXPORT-LOG-004 |
| [REQ-DATA-EXPORT-LOG-005](FDD.md#req-data-export-log-005) | [TDD#UX](TDD.md#ux)         | TEST-DATA-EXPORT-LOG-005 |
| [REQ-DATA-EXPORT-LOG-006](FDD.md#req-data-export-log-006) | [TDD#DATA](TDD.md#data)     | TEST-DATA-EXPORT-LOG-006 |

## TEST-DATA-EXPORT-LOG-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify tenant scope and explicit tenant-log permission.

Assert: Inspect actual export events without implementing export generation. Rows come from the append-only store with safe DTO projection.

Evidence: [executed API and browser verification](../../testing/HCM-1-DATA-EXPORT-LOG-VALIDATION.md). Actual export-row paging requires a separately approved producer.

## TEST-DATA-EXPORT-LOG-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test date boundaries, equal timestamps, malformed cursors and forbidden summary keys.

Assert: Filter and paginate using stable event ordering; no raw payload, document body or credential fields.

Evidence: [executed API and browser verification](../../testing/HCM-1-DATA-EXPORT-LOG-VALIDATION.md). Actual export-row paging requires a separately approved producer.

## TEST-DATA-EXPORT-LOG-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: No seeded fictional history appears as actual activity; no edit/delete/export action exists.

Assert: No export rows is the correct state while no exporters exist.

Evidence: [executed API and browser verification](../../testing/HCM-1-DATA-EXPORT-LOG-VALIDATION.md). Actual export-row paging requires a separately approved producer.

## TEST-DATA-EXPORT-LOG-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.audit and subject scope. Browser visibility never authorizes an action.

Evidence: [executed API and browser verification](../../testing/HCM-1-DATA-EXPORT-LOG-VALIDATION.md). Actual export-row paging requires a separately approved producer.

## TEST-DATA-EXPORT-LOG-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: [executed API and browser verification](../../testing/HCM-1-DATA-EXPORT-LOG-VALIDATION.md). Actual export-row paging requires a separately approved producer.

## TEST-DATA-EXPORT-LOG-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Evidence: [executed API and browser verification](../../testing/HCM-1-DATA-EXPORT-LOG-VALIDATION.md). Actual export-row paging requires a separately approved producer.
