# Attendance & Work Schedule — Domain Model

Current-release applicability: the [approved decisions](../../roadmap/HCM-3-DECISIONS.md#decisions) and [owning technical design](TECHNICAL-DESIGN.md) explicitly exclude future logical entities/transitions for offline/device/geofence capture, auto-close, pooled claim/release, delegation creation, new step-up and encashment payment/handoff. Broader logical state/table catalogues below are not permission to implement those capabilities. Physical identity and exact-duration mappings are specified by the SQL TDD; Unpaid tracking is an explicit exception to account/reservation transitions.

Attendance separates configuration, planned work, raw evidence, calculated attendance, corrections/approvals, locked periods and downstream work evidence.

## Configuration

- Work Schedule -> immutable versions -> day patterns -> segments.
- Shift -> immutable versions -> segments.
- Holiday Calendar -> immutable versions -> holidays.
- Attendance Policy -> immutable versions -> approval/rounding/grace/overtime/capture rules.
- Assignments/overrides/rosters determine which effective configuration applies to one Employment/local work date.

## Published workday

Configuration resolution produces a versioned Published Workday and Published Work Segments. This is the explainable schedule input consumed by attendance calculation and Leave request calculation.

## Evidence and calculation

```text
Capture Source -> append-only Attendance Event
                    |
                    v
Attendance Calculation Run -> Attendance Day revision
                               -> Sessions
                               -> Anomalies
                               -> optional approval/correction

Attendance Period -> lock/reopen evidence
Approved/Locked Attendance Day -> WorkEvidence
```

## Authority

- Raw attendance events are immutable evidence; corrections append/supersede rather than editing occurrence history.
- Attendance calculation retains exact minutes and policy/classification evidence.
- Overtime is non-monetary time evidence here; rates/payment belong elsewhere.
- Attendance owns correction/approval truth. Workflow may coordinate tasks only.
- Locked periods freeze the consumed evidence basis; late changes use explicit reopen/delta contracts.
- WorkEvidence is the bounded handoff to Leave comp-off and future Payroll, with replacement/reversal rather than mutation.

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.
