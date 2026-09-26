# HCM-2 — Decisions to Finalize Before Implementation

Claude must treat this as the current HCM-2 decision register. Ask the product owner for decisions that block an app being prepared. Do not invent answers.

## Blocks workforce create/import

1. **Duplicate-person detection and merge policy** — what confidence thresholds and identifiers are allowed by jurisdiction for manual create/import, and when must a human resolve a candidate match?

## Blocks Employment Changes

2. **Employment-change approval matrix** — which change types require approval, how many independent approvers, and what maximum backdating is permitted by change type?

## Blocks Probation Management / Probation Review

3. **Probation defaults** — review schedule, rating/recommendation scale, extension rules and escalation defaults.

## Blocks HR Service Desk / My HR Requests

4. **HR service policy** — service calendars, initial SLA targets and how long an employee may reopen a resolved request.

## Blocks Job Catalogue seed/readiness

5. **Initial job architecture shape** — initial family depth, supported career tracks and level descriptors.
6. **Grade/band catalogue** — initial code set/order and whether the first product release supports one or multiple job catalogues per Organization.

## Blocks Positions / Assignment integration

7. **Position capacity policy** — concurrent/partial assignment allocation and whether temporary overfill is allowed, and under what authority.
8. **Position lifecycle approval** — approval thresholds and maker-checker policy for create/change/freeze/reopen/close/cancel.

## Blocks Position Requirements

9. **Requirement variance policy** — which Add/Replace/Strengthen/Waive operations are allowed and who may authorize a Waive.

## Can be deferred unless corresponding capability is included in HCM-2

10. External occupation/job/skill framework mappings for the initial release.
11. Job Architecture import match keys, hierarchy limits, row quotas and bulk-approval threshold.
12. Historical display behavior when jobs/positions close or organization units retire.

## Production governance decisions (do not block local HCM-2 unless the app needs them)

13. Finite retention/disposition and legal-hold behavior for personal/workforce/profile/import/change/probation/service/job-position data.

## Added during design reconciliation

These questions were found while reconciling the domain authority with the
current catalogue, database spine and HCM-1 authority matrix. The current
documents do not answer them, and each changes business behavior or authority.

14. **Structure maintenance ownership** — the HCM-2 catalogue has no app that
    maintains legal entities, organisation units, departments, designations or
    locations, yet Positions, Employee Records, Employment Changes and Org Chart
    depend on them. Which app owns their maintenance?
15. **Manager team scope** — HCM-1 gave managers no reporting-line scope. Team
    Directory needs one. Which workers does an explicitly granted team permission
    cover: direct reports only, the whole reporting subtree, or explicitly assigned
    organisation units?
16. **Identification type tenancy** — the domain model makes identification
    types a global product catalogue, but the Identification Types app sits in
    tenant administration. May tenants only view them, enable or disable product
    types for their use, or also define their own types?

## Already fixed by current architecture

- SQL-first migrations + Kysely typed query layer.
- Direct tenant scope + PostgreSQL RLS for tenant-owned tables.
- Database rows do not become DTOs automatically.
- Real PostgreSQL/API data only; no Angular business fixtures.
- UI business features are theme-agnostic and use approved semantic UI5/Fundamental controls/floorplans.
- Reporting/position hierarchy never grants authorization.

<a id="decisions"></a>

## Decision status

Classification is relative to the whole HCM-2 wave; each app decision register
classifies the same item against that app's own scope.

| ID           | Item | Classification          | Status                                                                                                                                                                                                                                                                             |
| ------------ | ---- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-HCM2-001 | 1    | RESOLVED                | Answered 2026-09-26: A candidate is an exact normalized-name match with the same birth date, or an exact work-email match; any candidate blocks creation until HR uses the existing person, creates new with a reason, or skips the row; merging is a separate explicit HR action. |
| DEC-HCM2-002 | 2    | RESOLVED                | Answered 2026-09-26: Every change type needs one approver who is not the requester; changes may be backdated up to 30 days and corrections up to 90 days.                                                                                                                          |
| DEC-HCM2-003 | 3    | RESOLVED                | Answered 2026-09-26: One final review due 14 days before the probation end date; 1–5 rating with Confirm, Extend, Fail or No change; at most one extension of up to 90 days; overdue reviews escalate to the owning HR account 7 days after the due date.                          |
| DEC-HCM2-004 | 4    | RESOLVED                | Answered 2026-09-26: 24x7 calendar clock; first response and resolution targets P1 4h/1d, P2 1d/3d, P3 2d/5d, P4 3d/10d; clocks pause while waiting for the employee; reopen within 7 days of resolution.                                                                          |
| DEC-HCM2-005 | 5    | RESOLVED                | Answered 2026-09-26: Families at most two levels deep; Individual Contributor and Management tracks; levels described by name, sequence and scope summary.                                                                                                                         |
| DEC-HCM2-006 | 6    | RESOLVED                | Answered 2026-09-26: One catalogue per organisation; four ordered bands (Entry, Professional, Senior, Leadership) holding grades G1–G8, two per band.                                                                                                                              |
| DEC-HCM2-007 | 7    | RESOLVED                | Answered 2026-09-26: Partial FTE allowed; an assignment is rejected if it would exceed headcount or FTE capacity; no overfill.                                                                                                                                                     |
| DEC-HCM2-008 | 8    | RESOLVED                | Answered 2026-09-26: Every position change request, including requirement changes, needs one approver who is not the requester.                                                                                                                                                    |
| DEC-HCM2-009 | 9    | RESOLVED                | Answered 2026-09-26: Add, Replace, Strengthen and Waive are allowed; a request containing a Waive can be approved only by an independent approver who also holds the waive permission, with a justification.                                                                       |
| DEC-HCM2-010 | 10   | BLOCKS_LATER_CAPABILITY | Deferred. HCM-2 stores no external framework mappings and hides those fields.                                                                                                                                                                                                      |
| DEC-HCM2-011 | 11   | BLOCKS_LATER_CAPABILITY | Deferred. Job Architecture import is outside HCM-2.                                                                                                                                                                                                                                |
| DEC-HCM2-012 | 12   | BLOCKS_LATER_CAPABILITY | Deferred. HCM-2 shows closed or retired items with their status and no special historical view.                                                                                                                                                                                    |
| DEC-HCM2-013 | 13   | BLOCKS_LATER_CAPABILITY | Deferred to production governance; no HCM-2 local app deletes or disposes data.                                                                                                                                                                                                    |
| DEC-HCM2-014 | 14   | RESOLVED                | Answered 2026-09-26: A new Organization Structure app in workforce-foundation maintains legal entities, unit types, effective-dated units, departments, designations and locations.                                                                                                |
| DEC-HCM2-015 | 15   | RESOLVED                | Answered 2026-09-26: Team scope is direct reports only: workers whose current primary solid line points to one of the manager's current assignments.                                                                                                                               |
| DEC-HCM2-016 | 16   | RESOLVED                | Answered 2026-09-26: Tenants view the product-maintained identification type catalogue only; there is no tenant management action.                                                                                                                                                 |

<a id="evidence"></a>

## Resolution evidence

On 2026-09-26 the product owner answered twelve structured questions in the HCM-2
preparation task. Each question named the decision ID, the blocked apps, and two or
three concrete options with their trade-offs. The owner selected the option marked
_Recommended_ for every question:

| ID           | Selected answer                          |
| ------------ | ---------------------------------------- |
| DEC-HCM2-001 | Name+birth date/email, HR resolves       |
| DEC-HCM2-002 | 1 approver, all types, 30-day backdate   |
| DEC-HCM2-003 | Final review, 5-point, 1 extension       |
| DEC-HCM2-004 | 24x7 clock, tiered targets, 7-day reopen |
| DEC-HCM2-005 | 2 family levels, IC + Mgmt tracks        |
| DEC-HCM2-006 | 1 catalogue, 4 bands, G1–G8              |
| DEC-HCM2-007 | Enforce headcount and FTE                |
| DEC-HCM2-008 | 1 independent approver, all types        |
| DEC-HCM2-009 | All four; Waive needs waive grant        |
| DEC-HCM2-014 | Add Organization Structure app           |
| DEC-HCM2-015 | Direct reports only                      |
| DEC-HCM2-016 | View the product catalogue only          |

These answers resolve business policy. They are not approval of the FDD, TDD or
blueprint revisions written from them; those need their own review under the
[readiness process](../engineering/APP-READINESS.md).
