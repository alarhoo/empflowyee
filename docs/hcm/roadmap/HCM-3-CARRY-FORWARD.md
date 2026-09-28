# HCM-3 — Carry-forward

These items are intentionally outside the HCM-3 business implementation unless a current FDD explicitly pulls them in:

- Payroll monetary valuation/payment for overtime and leave encashment.
- Production external notification delivery beyond currently implemented HCM notification capabilities.
- Generic production mobile/offline/device capture infrastructure unless admitted by the Attendance decision set.
- Final jurisdiction/legal retention packs and legal hold/disposition automation.
- Cross-module analytics marts/trends beyond operational HCM-3 projections.
- Exit/final-settlement orchestration.
- Workflow source adapters beyond the source types approved in HCM-3 Step 1.

Keep these visible in the repository carry-forward mechanism; do not implement placeholders that pretend they are complete.

## Step-1 classifications

The [review register](HCM-3-DECISIONS.md#step-1-register--2026-09-28) keeps production
statutory/retention (001), monetary consumer handoff (002), capture retention and
precision (009), workflow retention (017) and production SLOs (018) as later
capability gates. Current functional security, source authority and durable
recovery are not deferred.

Product resolutions admit online web capture, configurable overtime disabled
until complete policy, direct/candidate-offer tasks, and the shared hcm-worker.
Pools, delegation creation, offline/device capture and stronger step-up remain
future capabilities. Encashment is units-only disabled configuration/contracts;
LOP is Unpaid tracking. None is an unresolved current-app product question.

Current `FieldCipher` uses tenant-level data keys. Per-record crypto-erasure and
finite legal-hold/disposition must not be claimed implemented by that mechanism.
