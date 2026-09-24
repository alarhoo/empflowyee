# HCM-1 local-stage design review

Status: **20 app design packages complete for review; no application code implemented**.
The product owner approved the 20-app stage, access authority matrix and bounded
document/notification behavior. [Business decision evidence](HCM-1-DECISIONS.md)
is separate from approval of these newly authored FDD/TDD/blueprint revisions.

## Scope and review order

Review the [approved stage](HCM-1-LOCAL-DELIVERY.md), then
[common API/security/SQL/UX selections](../tdd/TDD-HCM-1-LOCAL-COMMON.md),
[exact permission register](../tdd/HCM-1-PERMISSION-MATRIX.md), and owning domain contracts:

- [Access control](../domain/HCM-1-ACCESS-CONTROL.md): protected roles, grants, concurrency and manual reviews.
- [Identity access](../domain/HCM-1-IDENTITY-ACCESS.md): account records and read-only own/domain projections.
- [Audit](../domain/HCM-1-AUDIT.md): append-only safe evidence and actor-filtered views.
- [Notifications](../domain/HCM-1-NOTIFICATIONS.md): three in-app events, fixed recipients, preferences and atomic intents.
- [Documents](../domain/HCM-1-DOCUMENTS.md): sharing/request lifecycle and staged persistent local file recovery.

No new production authentication, product/deployable boundary, tenant-isolation
model or database ownership is proposed. Runtime persona propagation to approved
local commands requires the scoped ADR update described in the common TDD when
implementation is separately authorized. No runtime behavior changes in this work.

## App packages

Routes and floorplans are selected in designs, pending reviewed catalogue publication.
Native Standard Page is selected for three simple views; the other 17 consume the
existing native Dynamic Page integration. The known Object Page accessibility gate
is not bypassed. Every package has six stable requirements and six planned test
scenarios, with 1:1 design/test traceability (120 total requirements/scenarios).

| App                           | Domain          | Review files                                                                                                                                                                                                                                                                                           | Selected route                                | Floorplan             |
| ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------------------- |
| `ACCESS_ASSIGNMENTS`          | access-control  | [FDD](../apps/access-assignments/FDD.md) · [TDD](../apps/access-assignments/TDD.md) · [decisions](../apps/access-assignments/DECISIONS.md) · [tests](../apps/access-assignments/TRACEABILITY.md) · [blueprint](../apps/access-assignments/BLUEPRINT.json)                                              | `/access-control/access-assignments`          | `UX-FP-DYNAMIC-PAGE`  |
| `APP_CATALOGUE_CONFIGURATION` | access-control  | [FDD](../apps/app-catalogue-configuration/FDD.md) · [TDD](../apps/app-catalogue-configuration/TDD.md) · [decisions](../apps/app-catalogue-configuration/DECISIONS.md) · [tests](../apps/app-catalogue-configuration/TRACEABILITY.md) · [blueprint](../apps/app-catalogue-configuration/BLUEPRINT.json) | `/access-control/app-catalogue-configuration` | `UX-FP-DYNAMIC-PAGE`  |
| `AUDIT_LOG`                   | audit           | [FDD](../apps/audit-log/FDD.md) · [TDD](../apps/audit-log/TDD.md) · [decisions](../apps/audit-log/DECISIONS.md) · [tests](../apps/audit-log/TRACEABILITY.md) · [blueprint](../apps/audit-log/BLUEPRINT.json)                                                                                           | `/audit/audit-log`                            | `UX-FP-DYNAMIC-PAGE`  |
| `DATA_EXPORT_LOG`             | audit           | [FDD](../apps/data-export-log/FDD.md) · [TDD](../apps/data-export-log/TDD.md) · [decisions](../apps/data-export-log/DECISIONS.md) · [tests](../apps/data-export-log/TRACEABILITY.md) · [blueprint](../apps/data-export-log/BLUEPRINT.json)                                                             | `/audit/data-export-log`                      | `UX-FP-DYNAMIC-PAGE`  |
| `DOCUMENT_REQUESTS`           | documents       | [FDD](../apps/document-requests/FDD.md) · [TDD](../apps/document-requests/TDD.md) · [decisions](../apps/document-requests/DECISIONS.md) · [tests](../apps/document-requests/TRACEABILITY.md) · [blueprint](../apps/document-requests/BLUEPRINT.json)                                                   | `/documents/document-requests`                | `UX-FP-DYNAMIC-PAGE`  |
| `DOCUMENT_TEMPLATES`          | documents       | [FDD](../apps/document-templates/FDD.md) · [TDD](../apps/document-templates/TDD.md) · [decisions](../apps/document-templates/DECISIONS.md) · [tests](../apps/document-templates/TRACEABILITY.md) · [blueprint](../apps/document-templates/BLUEPRINT.json)                                              | `/documents/document-templates`               | `UX-FP-DYNAMIC-PAGE`  |
| `DOCUMENT_TYPES`              | documents       | [FDD](../apps/document-types/FDD.md) · [TDD](../apps/document-types/TDD.md) · [decisions](../apps/document-types/DECISIONS.md) · [tests](../apps/document-types/TRACEABILITY.md) · [blueprint](../apps/document-types/BLUEPRINT.json)                                                                  | `/documents/document-types`                   | `UX-FP-DYNAMIC-PAGE`  |
| `DOMAIN_CONFIGURATION`        | identity-access | [FDD](../apps/domain-configuration/FDD.md) · [TDD](../apps/domain-configuration/TDD.md) · [decisions](../apps/domain-configuration/DECISIONS.md) · [tests](../apps/domain-configuration/TRACEABILITY.md) · [blueprint](../apps/domain-configuration/BLUEPRINT.json)                                    | `/identity-access/domain-configuration`       | `UX-FP-STANDARD-PAGE` |
| `EMPLOYEE_DOCUMENTS`          | documents       | [FDD](../apps/employee-documents/FDD.md) · [TDD](../apps/employee-documents/TDD.md) · [decisions](../apps/employee-documents/DECISIONS.md) · [tests](../apps/employee-documents/TRACEABILITY.md) · [blueprint](../apps/employee-documents/BLUEPRINT.json)                                              | `/documents/employee-documents`               | `UX-FP-DYNAMIC-PAGE`  |
| `IDENTITY_ADMINISTRATION`     | identity-access | [FDD](../apps/identity-administration/FDD.md) · [TDD](../apps/identity-administration/TDD.md) · [decisions](../apps/identity-administration/DECISIONS.md) · [tests](../apps/identity-administration/TRACEABILITY.md) · [blueprint](../apps/identity-administration/BLUEPRINT.json)                     | `/identity-access/identity-administration`    | `UX-FP-DYNAMIC-PAGE`  |
| `MY_ACTIVITY`                 | audit           | [FDD](../apps/my-activity/FDD.md) · [TDD](../apps/my-activity/TDD.md) · [decisions](../apps/my-activity/DECISIONS.md) · [tests](../apps/my-activity/TRACEABILITY.md) · [blueprint](../apps/my-activity/BLUEPRINT.json)                                                                                 | `/audit/my-activity`                          | `UX-FP-DYNAMIC-PAGE`  |
| `MY_DOCUMENTS`                | documents       | [FDD](../apps/my-documents/FDD.md) · [TDD](../apps/my-documents/TDD.md) · [decisions](../apps/my-documents/DECISIONS.md) · [tests](../apps/my-documents/TRACEABILITY.md) · [blueprint](../apps/my-documents/BLUEPRINT.json)                                                                            | `/documents/my-documents`                     | `UX-FP-DYNAMIC-PAGE`  |
| `MY_NOTIFICATIONS`            | notifications   | [FDD](../apps/my-notifications/FDD.md) · [TDD](../apps/my-notifications/TDD.md) · [decisions](../apps/my-notifications/DECISIONS.md) · [tests](../apps/my-notifications/TRACEABILITY.md) · [blueprint](../apps/my-notifications/BLUEPRINT.json)                                                        | `/notifications/my-notifications`             | `UX-FP-DYNAMIC-PAGE`  |
| `MY_NOTIFICATION_PREFERENCES` | notifications   | [FDD](../apps/my-notification-preferences/FDD.md) · [TDD](../apps/my-notification-preferences/TDD.md) · [decisions](../apps/my-notification-preferences/DECISIONS.md) · [tests](../apps/my-notification-preferences/TRACEABILITY.md) · [blueprint](../apps/my-notification-preferences/BLUEPRINT.json) | `/notifications/my-notification-preferences`  | `UX-FP-STANDARD-PAGE` |
| `MY_SECURITY`                 | identity-access | [FDD](../apps/my-security/FDD.md) · [TDD](../apps/my-security/TDD.md) · [decisions](../apps/my-security/DECISIONS.md) · [tests](../apps/my-security/TRACEABILITY.md) · [blueprint](../apps/my-security/BLUEPRINT.json)                                                                                 | `/identity-access/my-security`                | `UX-FP-STANDARD-PAGE` |
| `NOTIFICATION_RULES`          | notifications   | [FDD](../apps/notification-rules/FDD.md) · [TDD](../apps/notification-rules/TDD.md) · [decisions](../apps/notification-rules/DECISIONS.md) · [tests](../apps/notification-rules/TRACEABILITY.md) · [blueprint](../apps/notification-rules/BLUEPRINT.json)                                              | `/notifications/notification-rules`           | `UX-FP-DYNAMIC-PAGE`  |
| `NOTIFICATION_TEMPLATES`      | notifications   | [FDD](../apps/notification-templates/FDD.md) · [TDD](../apps/notification-templates/TDD.md) · [decisions](../apps/notification-templates/DECISIONS.md) · [tests](../apps/notification-templates/TRACEABILITY.md) · [blueprint](../apps/notification-templates/BLUEPRINT.json)                          | `/notifications/notification-templates`       | `UX-FP-DYNAMIC-PAGE`  |
| `ROLE_MANAGEMENT`             | access-control  | [FDD](../apps/role-management/FDD.md) · [TDD](../apps/role-management/TDD.md) · [decisions](../apps/role-management/DECISIONS.md) · [tests](../apps/role-management/TRACEABILITY.md) · [blueprint](../apps/role-management/BLUEPRINT.json)                                                             | `/access-control/role-management`             | `UX-FP-DYNAMIC-PAGE`  |
| `SENSITIVE_ACCESS_LOG`        | audit           | [FDD](../apps/sensitive-access-log/FDD.md) · [TDD](../apps/sensitive-access-log/TDD.md) · [decisions](../apps/sensitive-access-log/DECISIONS.md) · [tests](../apps/sensitive-access-log/TRACEABILITY.md) · [blueprint](../apps/sensitive-access-log/BLUEPRINT.json)                                    | `/audit/sensitive-access-log`                 | `UX-FP-DYNAMIC-PAGE`  |
| `TENANT_ACCESS_REVIEWS`       | access-control  | [FDD](../apps/tenant-access-reviews/FDD.md) · [TDD](../apps/tenant-access-reviews/TDD.md) · [decisions](../apps/tenant-access-reviews/DECISIONS.md) · [tests](../apps/tenant-access-reviews/TRACEABILITY.md) · [blueprint](../apps/tenant-access-reviews/BLUEPRINT.json)                               | `/access-control/tenant-access-reviews`       | `UX-FP-DYNAMIC-PAGE`  |

## Deliberate bounded behavior

- Account/role administrators do not automatically read HR files. Manager has only
  own-person access until a reporting-line model is approved.
- System roles are protected, and concurrent grants/disables/reviews share the
  last-enabled-administrator check. Discovery permissions are never API grants.
- Hostname/catalogue views are projections; HCM does not become Account's licensing
  or DNS configuration authority.
- Reviewed metadata publication must add Employee placement for Document Requests
  and HR placement for Document Types/Templates, using the exact existing group
  IDs in their TDDs. Each retains one domain-owned implementation.
- Upload reserves a private staged file, then commits a Ready version and its
  business effects only after durable bytes exist. Authenticated retry and explicit
  orphan reconciliation handle crash windows without silently finalizing commands.
- Document requests have the approved manual states and immutable submissions.
  Three in-app events create per-recipient idempotent intents; no background worker
  impersonation, email or webhooks are introduced.
- Audit/export views can correctly be empty. No fake historical activity is seeded
  just to populate a screen. Stream completion is not proof of client receipt.

## Revision review and implementation admission

APPROVALS.json is deliberately empty in each package. The factory requires human
review evidence tied to the exact normalized document hashes. Approval of business
policy before these documents existed cannot truthfully be entered as approval
of their new revisions. The [validation report](../testing/HCM-1-LOCAL-DESIGN-VALIDATION.md)
separates design completeness from the admission gate; do not weaken the checker
or set catalogue approval flags to make it green.

After actual revision review, record reviewer/date/evidence for the blueprint and
all its registered documents, publish approved route/floorplan and FDD/TDD/clear
summaries in the canonical catalogue, regenerate its runtime projection, and rerun
all 20 app checks. Review all 20 before the first implementation slice. Reference
the report's hash manifest when reviewing; any later edit invalidates affected hashes.
This is a review procedure, not a request to implement application code now.

Six apps remain Planned and without generated designs: ACTIVE_SESSIONS,
API_CREDENTIALS, SECURITY_POLICIES, SSO_CONFIGURATION,
EMAIL_SENDER_CONFIGURATION and OUTBOUND_WEBHOOKS. Full HCM-1 readiness remains
blocked independently of the local-stage review. No approval is inferred for them.
