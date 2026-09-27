# HCM HR Service Desk feature

Lazy feature for `/employee/hr-service-desk` (app `HR_SERVICE_DESK`). HR agents work employee
service requests with employee-visible replies and internal notes, route them to teams and agents,
and move them through the lifecycle on DEC-HCM2-004 service level targets. Holders of the configure
permission maintain teams, memberships, request types and versioned service levels.

- Floorplan `UX-FP-FCL` NATIVE with two columns:
  - Begin: `HcmDynamicPage` with a SegmentedButton view (Assigned to me, My teams, All,
    Configuration), search and status, priority and SLA filters over a server-mode Table of
    requests (25, growing). Priority, status and SLA state are inverted ObjectStatus; Breached is
    Negative and Due soon Critical. The Configuration view lists one kind at a time; a row opens
    its edit Dialog.
  - Mid: `HcmObjectPage` for a request with Conversation (UI5 Timeline, 50 messages per page,
    and a composer with TextArea and FileUploader), Details, Service levels, Assignment history and
    Attachments. Internal notes carry an Information ObjectStatus.
- Raising a request, assignment and status changes use one Dialog; configuration uses another,
  with StepInput for minute targets. Both use Signal Forms, keep the draft on failure and close only
  after the server confirms.
- Attachments download through authenticated HTTP. Data comes from the real HR Service Desk API;
  no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/hr-service-desk/FDD.md) and
[TDD](../../../../../docs/hcm/apps/hr-service-desk/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/hr-service-desk.spec.ts`.
