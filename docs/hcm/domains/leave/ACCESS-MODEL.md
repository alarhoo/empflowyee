# Leave — Application Functions

Every operation requires authenticated tenant/principal context, the required entitlement and permission, and independently resolved row scope. Role names are seed/navigation guidance only; backend authorization is authoritative.

| App                     | Function                       | Purpose                                                                 | Default scope/discovery                          |
| ----------------------- | ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------ |
| APPLY_LEAVE             | LEAVE_SELF_MANAGE              | Preview, draft, submit, withdraw and cancel own leave                   | Exact self employment / Employee                 |
| LEAVE_BALANCE           | LEAVE_BALANCE_SELF_READ        | Read own policy-shaped balances and history                             | Exact self employment / Employee                 |
| COMP_OFF_ENCASHMENT     | LEAVE_COMP_OFF_ENCASHMENT_SELF | Claim own comp-off and inspect unavailable encashment                   | Exact self employment / Employee                 |
| TEAM_CALENDAR           | LEAVE_TEAM_CALENDAR_VIEW       | View privacy-safe approved team absence                                 | Current scoped reportees / Manager               |
| APPROVE_LEAVES          | LEAVE_APPROVAL_ACT             | Read and decide currently assigned leave-domain cases                   | Exact approval slot + current scope / Approver   |
| LEAVE_ADMINISTRATION    | LEAVE_OPERATIONS_MANAGE        | Operate scoped requests, enrollments, accruals, balances and exceptions | Assigned HR scope / Leave administrator          |
| COMP_OFF_ADMINISTRATION | LEAVE_COMP_OFF_ADMINISTER      | Validate evidence, credit and reconcile comp-off                        | Assigned HR/time scope / Leave administrator     |
| LEAVE_ENCASHMENT        | LEAVE_ENCASHMENT_ADMINISTER    | Inspect units-only configuration and unavailable consumer state         | Assigned HR/payroll liaison scope                |
| LEAVE_POLICIES          | LEAVE_POLICY_MANAGE            | Configure, preview and publish leave policy                             | Tenant/organization / Leave policy administrator |

## Access invariants

- Self, manager relationship, task assignment, calendar membership, planner membership or administrator title never substitute for an explicit permission and current scope.
- Routing/discovery is not authorization. Decision/action endpoints recheck current authority and subject state.
- Cross-tenant correlation is forbidden; tenant context is server-established and RLS-enforced.
- Sensitive projections are purpose-built and minimum-data; broad source objects are not copied into queues/calendars/notifications.
- Assignment/reporting relationships may help discover candidates but never grant permission on their own.

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
