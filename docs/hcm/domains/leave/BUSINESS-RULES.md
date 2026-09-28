# Leave — Business Rules

1. A published policy version is immutable and effective ranges for the same policy cannot overlap.
2. Eligibility is evaluated for one employment as of a date; a dated explicit assignment has defined precedence over general typed rules.
3. Concurrent employments have separate enrollments, accounts, requests and approval context.
4. Leave type unit, policy unit, request-day unit and balance-account unit must agree; conversion is explicit and snapshot-backed.
5. The ledger and debit-to-credit allocations are append-only. Corrections use reversal or adjustment; allocations prove which expiring credit was consumed and account totals equal ledger totals and active reservations.
6. Balance-tracked submission locks the account and denies units beyond available balance before reservation; Unpaid LOP has neither account nor reservation.
7. A reservation references exactly one leave or encashment request and may be consumed or released once.
8. One request day represents one local date/portion; dates, minutes and units must reconcile to the request total.
9. Overlapping nonterminal leave for the same employment/time is denied unless a versioned policy explicitly permits the combination.
10. Notice, maximum duration, bridge, blackout, attachment and negative-balance behavior come only from the selected published policy version.
11. Medical/sensitive evidence must be clean, restricted and omitted from calendar, ordinary notification, search and general export projections.
12. Request material edits after submission create a new calculation/version and invalidate existing case/decisions; decisions are never transplanted.
13. A decision requires current permission, current non-pooled scope, exact slot authority, a valid authenticated session and a distinct subject/requester where policy requires.
14. Routing, manager relationship, task assignment or team membership alone never grants read or decision access.
15. Rejection, withdrawal, invalidation or failed terminal processing releases active reservation exactly once.
16. Approved leave consumption posts per request day according to the configured posting point; cancellation reverses only applied eligible day transactions.
17. Accrual item uniqueness is enrollment/rule/accrual-date; rerun returns the durable result instead of posting again.
18. Carry-forward and expiry preserve source/expiry evidence and do not rewrite an old period's transaction.
19. A comp-off evidence reference earns once; earned units cannot be used after expiry and partial use preserves remaining units.
20. Manual comp-off or balance correction requires explicit permission, evidence/reason and independent approval at configured risk.
21. Current encashment stores units-only configuration with submission/reservation/handoff disabled. Future activation must enforce rule limits and retained balance under an approved consumer contract.
22. Leave stores encashment units/status only; rate, taxable value, currency and payment are target-system facts.
23. Team calendar never exposes balance, request reason/comment/evidence, approval reason or a sensitive leave-type label.
24. Business dates use the applicable local timezone; timestamps are UTC; all decimal calculations use fixed precision and a named rounding rule.
25. One day's unit value uses that local date's scheduled minutes as denominator, with the policy's standard-day fallback only where no schedule legitimately exists; half-day portions are schedule-derived and always sum to the full day.
26. Request rounding is applied per day row at the published mode/increment and the request total is the exact sum of rounded day rows; hourly requests must be whole multiples of the published increment.
27. Minutes of a shift crossing local midnight belong to the shift start date, and a request spanning two leave periods or published policy versions is denied rather than silently split.
28. Eligibility precedence is declared statutory floor, published version, dated assignment, typed rule priority with Exclude winning ties, then fail-closed; an exclusion cannot remove a version that declares a floor.
29. Auto-approval exists only as the absence of a matching required slot; adjustment, manual comp-off and encashment always require an independent slot, and elapsed time never approves anything.
30. A vacant/conflicted approval slot considers currently authorized candidates up the reporting chain, then the administration exception queue. Escalation never creates authority or a second case.
31. Comp-off conversion thresholds, per-work-date cap, claim window and expiry basis come only from the published comp-off rule; expiry posts remaining units only and partial use preserves proven remaining units.
32. Attachment classification is server-derived from leave type and policy, can never be downgraded, and an approver receives an evidence-satisfied flag rather than a medical document.
33. Every leave data class carries a finite retention class; disposition is idempotent, blocked by legal hold or an open obligation, and anonymizes rather than deletes ledger, decision and request evidence.
34. The future encashment handoff schema carries units/references only. Current release has no consumer submission/payment/callback endpoints; configuration and honest unavailable state only.

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
