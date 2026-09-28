# HCM-3 implementation status

Step-2 implementation is in progress. [Step-1 readiness](HCM-3-DESIGN-REVIEW.md)
admits all 23 designs; readiness does not mean the applications are implemented.

## Foundations

Workforce's read-only time-context prerequisite is implemented and verified;
see [projection validation](../testing/HCM-3-WORKFORCE-TIME-VALIDATION.md).

Attendance's schedule contract and exact-time calculation slice is implemented;
see [time validation](../testing/HCM-3-ATTENDANCE-TIME-VALIDATION.md).
Schedule storage and the version reader are also verified in
[storage validation](../testing/HCM-3-SCHEDULE-STORAGE-VALIDATION.md).
Policy/holiday contracts and holiday interval resolution are verified in
[configuration validation](../testing/HCM-3-POLICY-HOLIDAY-VALIDATION.md).
Policy/holiday storage and DTO projections are verified in
[configuration storage validation](../testing/HCM-3-CONFIGURATION-STORAGE-VALIDATION.md).
Reusable shifts and their persistence/projection are verified in
[shift validation](../testing/HCM-3-SHIFT-VALIDATION.md).
Dated configuration selection and exact workday interval composition are verified
in [workday interval validation](../testing/HCM-3-WORKDAY-INTERVAL-VALIDATION.md).
Schedule/template Draft commands and immutable command/preview evidence are
verified in [command validation](../testing/HCM-3-CONFIGURATION-COMMAND-VALIDATION.md).
The reusable template preview/publish/retire application flow is verified in
[publication validation](../testing/HCM-3-TEMPLATE-PUBLICATION-VALIDATION.md).
The template HTTP API and authenticated pagination are verified in
[API validation](../testing/HCM-3-TEMPLATE-API-VALIDATION.md).
Canonical template grants and incomplete draft defaults are verified in
[seed validation](../testing/HCM-3-SEED-DEFAULTS-VALIDATION.md).
Holiday calendar Draft creation/replacement/successor commands are verified in
[holiday command validation](../testing/HCM-3-HOLIDAY-COMMAND-VALIDATION.md).
The five holiday draft/read HTTP routes and migration 43 cursor extension are
verified in [holiday API validation](../testing/HCM-3-HOLIDAY-API-VALIDATION.md).
Dated Workforce/configuration input composition is verified in
[input validation](../testing/HCM-3-CONFIGURATION-INPUT-VALIDATION.md).
Remaining configuration APIs/seeds, durable workday publication, domain handlers
and the other app UIs remain pending.

| Slice                                             | State                                | Evidence                                                           |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Scoped access grants and decision-time checks     | Implemented                          | [Validation](../testing/HCM-3-ACCESS-FOUNDATION-VALIDATION.md)     |
| Verified workload context and audit attribution   | Implemented                          | [Validation](../testing/HCM-3-BACKGROUND-FOUNDATION-VALIDATION.md) |
| Evidence and notifications extensions             | Planned                              | [Foundation order](HCM-3-FOUNDATION-DESIGN.md#order)               |
| Durable domain work mechanics                     | Implemented                          | [Validation](../testing/HCM-3-BACKGROUND-FOUNDATION-VALIDATION.md) |
| Shared worker runtime/root                        | Implemented; domain handlers pending | [Runbook](../operations/WORKER.md)                                 |
| Attendance, Leave and Workflow domain foundations | Planned                              | [Ordered plan](HCM-3-FOUNDATION-DESIGN.md#order)                   |

**Work Schedule Templates is Complete** under local acceptance; see its
[production-build browser evidence](../testing/HCM-3-TEMPLATE-UI-VALIDATION.md).
The other 22 business apps remain Planned. Update this record and the canonical
app statuses only after their corresponding acceptance is verified.
Granular branches inherit prerequisite commits; main changes require PRs. Local
implementation commits do not deploy or provision cloud resources.
