# Leave — Initial Policy Baseline

This is the current first-market product seed baseline. It is configuration seed, not statutory truth. Tenants review/publish their own effective versions; jurisdiction policy can only raise a declared statutory floor.

## Seeded draft leave types

- `VAC`: 24 units/year, accruing 2 monthly.
- `LOP`: loss-of-pay/unpaid leave.
- `ML`: maternity leave.
- `PL`: paternity leave.
- `BRV`: bereavement leave.
- `VOTE`: voting leave.

No sick/casual/comp-off/encashment template is invented when the baseline policy does not grant one.

## Calculation baseline

- A leave day's denominator is scheduled minutes for that local work date; published standard-day fallback is allowed only when no schedule legitimately exists.
- Half-day uses the scheduled midpoint; hourly leave uses the published increment.
- Rounding occurs per request-day row; request total is the exact sum of rounded rows.
- Cross-midnight scheduled work belongs to the shift start date.
- A request crossing leave periods or published policy versions is denied rather than silently split.

## Request baseline

- Negative leave balance is not allowed; shortfall is handled explicitly rather than silently creating negative units.
- Vacation notice baseline is three days and is warning-oriented so emergencies remain possible.
- Medical evidence baseline begins at three consecutive days.
- Carry-forward baseline cap is five units.
- Consumption posts on approval under the current baseline.

## Approval baseline

- Line manager for all vacation/loss-of-pay requests.
- HR Operations above three units.
- Executive approval above five units.
- Adjustment, manual comp-off and encashment always require an independent approval slot.
- No elapsed-time auto-approval.
- Vacant/conflicted slots walk the reporting chain, then the administration exception queue.

## Comp-off baseline

The capability exists but no comp-off policy is enabled by default. When configured, the baseline model supports 240/480-minute conversion thresholds, one-unit-per-work-date cap, 30-day claim window and 90-day expiry from credit; partial use preserves the remaining proven units.

## Encashment baseline

Only an Annual-type policy may be made encashable. HCM-3 stores/reserves units and references only; it does not calculate money/tax/payment. The capability remains disabled until the downstream payroll/finance contract is explicitly admitted.

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
