# HCM-1 business permission register

Status: complete technical permission selection for review under the approved
authority matrix. These grants are **not applied**. They are not a replacement for
the current catalogue-discovery grant seed. Every listed permission requires its
entitlement and subject checks independently; the exact operation mapping is in
the linked app TDD endpoint table from the [design index](../roadmap/HCM-1-DESIGN-REVIEW.md).

## GRANTS

The names below identify development seed recipients, never runtime name checks.
The existing persisted role IDs are `employee` (Jim), `manager` (Michael),
`hr-specialist` (Toby) and `tenant-administrator` (David); these were verified in
the current immutable foundation seed. The new seed module references those keys.
Persist the register through new versioned seed modules and the forward business
permission constraint migration after approval. The employee, manager, HR and
administrator roles each receive the listed self grants directly, so the design
does not assume undeclared role inheritance. HR permission may be delegated by
an authorized administrator under the approved audited assignment policy. No
manager reporting-line grant or administrator content bypass is defined.

| Permission                                  | App                           | Entitlement           | Initial persona grants    | Subject rule                                                                 |
| ------------------------------------------- | ----------------------------- | --------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `hcm.access-control.assignments.read`       | `ACCESS_ASSIGNMENTS`          | `hcm.access-control`  | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.access-control.assignments.manage`     | `ACCESS_ASSIGNMENTS`          | `hcm.access-control`  | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.access-control.catalogue.read`         | `APP_CATALOGUE_CONFIGURATION` | `hcm.access-control`  | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.audit.events.read`                     | `AUDIT_LOG`                   | `hcm.audit`           | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.audit.exports.read`                    | `DATA_EXPORT_LOG`             | `hcm.audit`           | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.documents.requests.read`               | `DOCUMENT_REQUESTS`           | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.documents.requests.manage`             | `DOCUMENT_REQUESTS`           | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.documents.requests.self.read`          | `DOCUMENT_REQUESTS`           | `hcm.documents`       | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.documents.requests.self.submit`        | `DOCUMENT_REQUESTS`           | `hcm.documents`       | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.documents.requests.download`           | `DOCUMENT_REQUESTS`           | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.documents.requests.self.download`      | `DOCUMENT_REQUESTS`           | `hcm.documents`       | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.documents.templates.read`              | `DOCUMENT_TEMPLATES`          | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.documents.templates.manage`            | `DOCUMENT_TEMPLATES`          | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.documents.templates.download`          | `DOCUMENT_TEMPLATES`          | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.documents.types.read`                  | `DOCUMENT_TYPES`              | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.documents.types.manage`                | `DOCUMENT_TYPES`              | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.identity-access.domains.read`          | `DOMAIN_CONFIGURATION`        | `hcm.identity-access` | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.documents.worker.read`                 | `EMPLOYEE_DOCUMENTS`          | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.documents.worker.manage`               | `EMPLOYEE_DOCUMENTS`          | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.documents.worker.download`             | `EMPLOYEE_DOCUMENTS`          | `hcm.documents`       | Toby                      | Tenant workers/documents; explicit HR grant                                  |
| `hcm.identity-access.accounts.read`         | `IDENTITY_ADMINISTRATION`     | `hcm.identity-access` | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.identity-access.accounts.manage`       | `IDENTITY_ADMINISTRATION`     | `hcm.identity-access` | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.audit.activity.self.read`              | `MY_ACTIVITY`                 | `hcm.audit`           | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.documents.self.read`                   | `MY_DOCUMENTS`                | `hcm.documents`       | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.documents.self.download`               | `MY_DOCUMENTS`                | `hcm.documents`       | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.notifications.inbox.self.read`         | `MY_NOTIFICATIONS`            | `hcm.notifications`   | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.notifications.inbox.self.manage`       | `MY_NOTIFICATIONS`            | `hcm.notifications`   | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.notifications.preferences.self.read`   | `MY_NOTIFICATION_PREFERENCES` | `hcm.notifications`   | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.notifications.preferences.self.manage` | `MY_NOTIFICATION_PREFERENCES` | `hcm.notifications`   | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.identity-access.security.self.read`    | `MY_SECURITY`                 | `hcm.identity-access` | Jim, Michael, Toby, David | Verified own account/person only                                             |
| `hcm.notifications.rules.read`              | `NOTIFICATION_RULES`          | `hcm.notifications`   | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.notifications.rules.manage`            | `NOTIFICATION_RULES`          | `hcm.notifications`   | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.notifications.templates.read`          | `NOTIFICATION_TEMPLATES`      | `hcm.notifications`   | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.notifications.templates.manage`        | `NOTIFICATION_TEMPLATES`      | `hcm.notifications`   | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.access-control.roles.read`             | `ROLE_MANAGEMENT`             | `hcm.access-control`  | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.access-control.roles.manage`           | `ROLE_MANAGEMENT`             | `hcm.access-control`  | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.audit.sensitive-access.read`           | `SENSITIVE_ACCESS_LOG`        | `hcm.audit`           | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.access-control.reviews.read`           | `TENANT_ACCESS_REVIEWS`       | `hcm.access-control`  | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |
| `hcm.access-control.reviews.manage`         | `TENANT_ACCESS_REVIEWS`       | `hcm.access-control`  | David                     | Tenant scope; safe metadata for audit; protected-admin invariants for writes |

## DISCOVERY

Keep all existing 170 discovery permission definitions and persona discovery
grants. Business permissions never make an app route Available. The self-service
Document Requests selection requires the reviewed additive employee catalogue
placement described in its TDD. Document Types and Document Templates also require
additive HR catalogue membership/placement so their approved HR actor can reach
them; their TDDs name the exact existing IDs. Existing Administration discovery
does not grant document content to David. The canonical catalogue and generated runtime
projection remain unchanged in this design-only delivery. No duplicate app or
Space-owned feature is introduced.

## SAFETY

Custom roles can select only registered permission codes. Runtime cannot create
permission definitions, change their kind or alter commercial entitlement grants.
Every mutation still rechecks enabled actor, current grants, entitlement and subject
inside its unit of work. Removing a grant/entitlement denies the next request;
frontend cache refresh is usability behavior rather than the authorization boundary.
