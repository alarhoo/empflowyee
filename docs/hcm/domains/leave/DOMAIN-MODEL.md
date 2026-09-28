# Leave — Domain Model

Current-release applicability: the [approved decisions](../../roadmap/HCM-3-DECISIONS.md#decisions) and [owning technical design](TECHNICAL-DESIGN.md) explicitly exclude future logical entities/transitions for offline/device/geofence capture, auto-close, pooled claim/release, delegation creation, new step-up and encashment payment/handoff. Broader logical state/table catalogues below are not permission to implement those capabilities. Physical identity and exact-duration mappings are specified by the SQL TDD; Unpaid tracking is an explicit exception to account/reservation transitions.

Leave is an employment-context domain. Concurrent employments never share an implicit balance, request or approval context.

## Model

```text
Leave Type
  -> Leave Policy
      -> immutable published Policy Version
          -> eligibility / assignment / accrual / carry-forward / restriction / approval rules
          -> optional comp-off and encashment rules

Employment + Policy Version + Leave Period
  -> Worker Leave Enrollment
      -> entitlement grants
      -> balance account
          -> append-only ledger transactions
          -> reservations
          -> debit-to-credit allocations

Enrollment
  -> Leave Request
      -> local-date request days
      -> evidence/comments
      -> optional cancellation request
      -> domain-owned approval case/decisions

Attendance WorkEvidence
  -> Comp-Off Earning
      -> optional Comp-Off Credit Request

Balance Account
  -> Encashment Request
      -> units-only external handoff evidence
```

## Core authority rules

- Published policy versions are immutable; correction creates a new version.
- The append-only ledger is authoritative. Balance account is a lockable projection.
- Pending leave/encashment consumes availability through atomic reservations.
- Request calculation is local-date/schedule/holiday/timezone aware and stores the calculation snapshot needed to explain the result.
- Leave owns leave-domain decision truth. Workflow may coordinate tasks but cannot write Leave state directly.
- Team calendar is privacy-safe absence projection, never a reason/evidence/balance projection.
- Comp-off credit normally consumes approved Attendance work evidence.
- Encashment owns units only. Money/rates/tax/payment remain outside Leave.
- Evidence classification/retention is governed and medical/private evidence never leaks into ordinary calendars, notifications, search or export.

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.

Unpaid LOP enrollments track request/approval units without a balance account,
reservation or ledger debit/credit. Rules concerning reservations, posting and
allocations apply only to Balance tracking. Encashment contracts/configuration
are admitted; submission, external handoff and payment are disabled.
