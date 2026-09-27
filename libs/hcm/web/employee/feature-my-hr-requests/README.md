# HCM My HR Requests feature

Lazy feature for `/employee/my-hr-requests` (app `MY_HR_REQUESTS`). A worker raises questions and
corrections with HR, reads HR's replies and answers them, cancels a request HR has not resolved and
reopens a resolved one within 7 days (DEC-HCM2-004).

- Floorplan `UX-FP-FCL` NATIVE with two columns:
  - Begin: `HcmDynamicPage` with a SegmentedButton view (Open, Closed), a New request action and a
    server-mode Table of own requests (25, growing), status as inverted ObjectStatus.
  - Mid: `HcmObjectPage` with Conversation (UI5 Timeline and a reply composer with TextArea and
    FileUploader), Details and Attachments.
- New request, Cancel and Reopen use one Dialog with Signal Forms; the type is a UI5 Select of the
  types employees may raise. `?new=<type code>&field=<field code>` opens the Dialog with the type
  and a subject naming the field; the current value is never included and nothing is submitted
  automatically. My Profile links here for fields changed through HR.
- Internal notes, agent names and service level fields never reach this app. Data comes from the
  real My HR Requests API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/my-hr-requests/FDD.md) and
[TDD](../../../../../docs/hcm/apps/my-hr-requests/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/my-hr-requests.spec.ts`.
