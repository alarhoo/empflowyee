# HCM-1 UX revision authorization

On 2026-09-24 the product owner instructed this task to update the HCM UI/floorplan
implementation skill with a mandatory decision matrix, refactor Role Management,
then implement Access Assignments and continue the approved local delivery order.

The explicit role instruction was:

> Keep the filter/list in the begin column and open the selected role in a mid-column Object Page with Overview, Permissions, Assignees, and History/Audit sections.

The owner also required small focused dialogs, routed complex creates/edits,
dedicated wizard routes, approved native/composed floorplans, no feature CSS and
Access Assignments ownership of assignment behavior. The existing API behavior,
tests, authority matrix, PostgreSQL persistence and six deferred apps retain their
approved scope.

This instruction authorizes the UX design correction and the shared foundation
work necessary to implement it. Role contextual projections use existing role,
assignment and audit authority; they do not add a role-owned assignment writer.
The prior Dynamic-Page/dialog-only role selection is superseded. Every subsequent
slice must apply the new matrix to its approved FDD/TDD before implementation.

Approval-ledger updates cite this instruction for the role design and shared UX
selection evidence. Other apps retain their business design approvals. This does
not assert that the owner inspected generated code or execution artifacts; tests,
review and runtime acceptance remain separate required gates. No new business
decision or production integration is inferred from this UX authorization.
