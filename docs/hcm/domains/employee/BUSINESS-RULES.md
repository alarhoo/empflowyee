# Employee — Business Rules

1. Workforce Foundation typed entities remain authoritative; profile/read models and workflow rows never replace them.
2. Product sensitivity/visibility ceilings cannot be widened by a tenant. Effective visibility is the most restrictive applicable rule.
3. Requiredness, editability, verification, visibility and sensitivity are independent decisions.
4. A worker visibility preference can only narrow or exercise an allowed opt-in; it never grants row or field access.
5. A custom field keeps one owner scope and data type after its first value. A structural change requires a new definition/migration strategy.
6. Each custom value references exactly one Person, Worker, Employment or Assignment in the same tenant.
7. Sensitive/restricted custom values use encrypted canonical storage and safe masked display; they are excluded from ordinary search/export.
8. Directory inclusion and field visibility are evaluated at one effective instant.
9. Reporting relationships do not grant access; authorization scope must independently permit the query.
10. Import source/mapping/parser version becomes immutable when validation starts. Correction creates a new run.
11. Import validation/preview is side-effect free. A valid row is not a workforce fact until commit succeeds.
12. Duplicate match is advisory below the approved confidence threshold; automatic merge is forbidden.
13. A committed import row is not replayed under the same run/row idempotency identity.
14. Invitation eligibility requires an attributable workforce account/destination and no already-active account.
15. Routing groups and invitation batches do not grant authorization.
16. Direct editing of active employment/assignment facts is forbidden; use a workforce change/correction command.
17. Conflicting nonterminal workforce changes may not overlap the same effective context.
18. A requester cannot satisfy an independent approval slot, and one approver cannot occupy multiple distinct required slots.
19. Execution closes/opens dated rows without temporal overlap and re-resolves authoritative state after uncertainty/timeouts.
20. Probation Confirm/Extend/Fail/NoChange is separate from termination, compensation and performance-review processes.
21. Probation extension must extend the end/due date and creates another review obligation while preserving the prior decision.
22. HR service request initial description is the first message, not duplicated on the request row.
23. Internal HR service content is deny-by-default in serialization, indexing, notifications and exports.
24. Times are stored in UTC; effective employment facts use business dates; policy calendar time zones calculate deadlines server-side.
