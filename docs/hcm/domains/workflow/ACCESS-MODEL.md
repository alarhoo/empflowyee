# Workflow & Approvals — Application Functions

Every operation requires authenticated tenant/principal context, the required entitlement and permission, and independently resolved row scope. Role names are seed/navigation guidance only; backend authorization is authoritative.

| App                  | Function                           | Purpose                                                                     | Entitlement                                   | Default role grants      |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- | ------------------------ |
| MY_TASKS             | WORKFLOW_TASK_INBOX                | Discover and read assigned/offered tasks across source domains              | Workflow plus source module for each row      | Employee, Manager        |
| MY_TASKS             | WORKFLOW_TASK_ACTION               | Invoke registered Leave/Attendance approve/reject actions; no claim/release | Workflow plus source action entitlement       | Employee, Manager        |
| MY_APPROVALS         | WORKFLOW_APPROVAL_INBOX            | Discover consolidated actionable approval tasks                             | Workflow plus source module for each row      | Manager, Domain Approver |
| MY_APPROVALS         | WORKFLOW_APPROVAL_ACTION           | Invoke approve/reject intent for an exact domain slot                       | Workflow plus source approval entitlement     | Manager, Domain Approver |
| WORKFLOW_DEFINITIONS | WORKFLOW_DEFINITION_ADMINISTRATION | Draft, validate, preview and publish allowed workflow definitions           | Workflow; advanced capabilities feature-gated | Process Administrator    |
| WORKFLOW_OPERATIONS  | WORKFLOW_OPERATIONS                | Search health, reconcile and execute governed coordination recovery         | Workflow                                      | Workflow Operator        |

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
