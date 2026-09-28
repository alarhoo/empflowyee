# Attendance & Work Schedule — Business Rules

1. Published schedule, shift, holiday-calendar, attendance-policy and roster content is immutable; change creates a superseding version with a non-overlapping effective range.
2. Schedule, attendance and evidence are keyed by tenant + employment + local work date; concurrent employments never share an implicit result.
3. Approved dated override precedes published roster; published roster precedes ordinary schedule. Scoped assignment specificity is employment, assignment, location, department, org unit, legal entity, organization. Equal-precedence overlap blocks resolution.
4. A cross-midnight shift belongs to its scheduled start date. UTC instants, IANA timezone, local date/time and actual offset are retained; daylight-saving gaps/overlaps require an explicit resolution outcome.
5. Work/break segments within one version are ordered and non-overlapping; planned minutes are derived from resolved instants and not entered as an independent authority.
6. Holiday actual/observed/partial collisions resolve only by published category/priority rules; an unresolved equal-priority conflict blocks the workday.
7. Raw event occurrence, receipt, source identity/key and asserted coordinates cannot be edited or deleted through business commands. Supersession/exclusion is separate governed evidence.
8. Source event key plus source identity is unique. Identical replay returns the event; a different normalized payload under the same key is an idempotency conflict.
9. Offline capture is deferred. Current online web events use server receipt time; historical corrections are separately approved linked evidence.
10. Location/geofence/device/anti-spoof capability is deferred; the online endpoint rejects such assertions and claims no verification of them.
11. Pairing orders accepted events by occurred instant plus deterministic tie-break and policy. Ambiguous, duplicate-direction, missing-boundary or overlapping evidence creates an anomaly rather than guessed time.
12. Missing punches are never auto-closed in HCM-3. Unclosed sessions remain explicit anomalies until governed correction.
13. Exact minutes are retained. Grace affects classification, and named rounding is applied once at the configured result boundary; intermediate segments are not repeatedly rounded.
14. Attendance totals satisfy checked invariants: session exact minutes equal work plus break classification as applicable, counted categories do not overlap, and approved totals reference their calculation revision.
15. Approved leave may reduce scheduled absence/late expectations but never creates worked minutes; only minimum leave category/reference needed for reconciliation is consumed.
16. Overtime is non-monetary exact/policy-counted time until required approval. Attendance stores no rate, amount, currency, tax or payment promise.
17. Material correction edit or recalculation invalidates old pending approval. Applied correction adds evidence/disposition and a new calculation revision; old result/decision remains.
18. Routing/task assignment is discovery only. Decide rechecks one current authority grant, scope, subject distinction, stage/slot, result version, period and authenticated-session validity.
19. Roster entries must lie within employment/planner scope with no overlapping shifts. Minimum rest is inactive unless configured; its threshold and Warn/Block mode are explicit tenant/policy configuration, never a universal 11-hour rule.
20. Lock requires reconciled terminal inputs. Ordinary event disposition/recalculation cannot change a locked period; reopen or approved delta retains before/after and downstream consequences.
21. Work evidence is unique by consumer purpose + employment + work date + approved calculation/version. Correction publishes a linked reversal/replacement, never mutates the consumed record.
22. Team, notification, search and ordinary export projections omit precise location, IP, device fingerprint/assertion, private narrative, internal reason and unrelated leave data.
23. No biometric template/sample is stored. Classified event/location/evidence retention is finite and disposition-driven; `IsActive` or status is not retention.
24. Event import/device batch channels are deferred; they are not current capture APIs.
25. Payroll handoff is deferred. The admitted WorkEvidence consumer is Leave CompOff with approved exact qualifying time, revision/evidence and linked reversal/replacement; no direct table reads.
26. Current clock status is provisional and may lag/recalculate; it cannot be used as a final approved or payroll fact.

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.
