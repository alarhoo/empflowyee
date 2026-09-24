# My Notification Preferences — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                                                       | Design                      | Planned test                         |
| --------------------------------------------------------------------------------- | --------------------------- | ------------------------------------ |
| [REQ-MY-NOTIFICATION-PREFERENCES-001](FDD.md#req-my-notification-preferences-001) | [TDD#READ](TDD.md#read)     | TEST-MY-NOTIFICATION-PREFERENCES-001 |
| [REQ-MY-NOTIFICATION-PREFERENCES-002](FDD.md#req-my-notification-preferences-002) | [TDD#ACTION](TDD.md#action) | TEST-MY-NOTIFICATION-PREFERENCES-002 |
| [REQ-MY-NOTIFICATION-PREFERENCES-003](FDD.md#req-my-notification-preferences-003) | [TDD#RULES](TDD.md#rules)   | TEST-MY-NOTIFICATION-PREFERENCES-003 |
| [REQ-MY-NOTIFICATION-PREFERENCES-004](FDD.md#req-my-notification-preferences-004) | [TDD#AUTH](TDD.md#auth)     | TEST-MY-NOTIFICATION-PREFERENCES-004 |
| [REQ-MY-NOTIFICATION-PREFERENCES-005](FDD.md#req-my-notification-preferences-005) | [TDD#UX](TDD.md#ux)         | TEST-MY-NOTIFICATION-PREFERENCES-005 |
| [REQ-MY-NOTIFICATION-PREFERENCES-006](FDD.md#req-my-notification-preferences-006) | [TDD#DATA](TDD.md#data)     | TEST-MY-NOTIFICATION-PREFERENCES-006 |

## TEST-MY-NOTIFICATION-PREFERENCES-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: No email, mandatory alert or unsupported event preference is advertised.

Assert: Show requested/submitted/replacement-requested categories only; absent stored preference defaults enabled.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATION-PREFERENCES-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Reload verifies disabled choice; concurrent first saves conflict without duplicate rows.

Assert: Save one category explicitly; first save accepts expectedRevision 0 and stores revision 1.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATION-PREFERENCES-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Suppressed future event creates an intent outcome and no inbox item; old notifications remain.

Assert: Saved choices affect future event delivery, not existing inbox rows or tenant-disabled rules.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATION-PREFERENCES-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.notifications and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATION-PREFERENCES-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATION-PREFERENCES-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
