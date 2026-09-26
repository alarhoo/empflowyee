# HCM-2 business permission register

Status: complete technical permission selection for review. These grants are
**not applied**. They follow the [HCM-1 register](HCM-1-PERMISSION-MATRIX.md)
conventions: every permission also requires its entitlement and the subject scope
defined in the [HCM-2 shared contract](TDD-HCM-2-COMMON.md#auth). Persona names
identify seed recipients only; runtime never checks names.

Existing persisted role IDs are `employee` (Jim), `manager` (Michael),
`hr-specialist` (Toby) and `tenant-administrator` (David). Self permissions are
granted to every role directly; no role inheritance is assumed. Grants marked
with a decision ID follow that product decision, answered on 2026-09-26. Identification types stay read-only for tenants (DEC-HCM2-016), so no manage permission exists.

## GRANTS

| Permission                                           | App                              | Entitlement                | Initial persona grants    | Scope                                                                                    |
| ---------------------------------------------------- | -------------------------------- | -------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `hcm.workforce-foundation.identification-types.read` | `IDENTIFICATION_TYPES`           | `hcm.workforce-foundation` | David, Toby               | Tenant                                                                                   |
| `hcm.workforce-foundation.lookups.read`              | `LOOKUP_VALUES`                  | `hcm.workforce-foundation` | David, Toby               | Tenant                                                                                   |
| `hcm.workforce-foundation.lookups.manage`            | `LOOKUP_VALUES`                  | `hcm.workforce-foundation` | David                     | Tenant                                                                                   |
| `hcm.workforce-foundation.structure.read`            | `ORGANIZATION_STRUCTURE`         | `hcm.workforce-foundation` | David, Toby               | Tenant                                                                                   |
| `hcm.workforce-foundation.structure.manage`          | `ORGANIZATION_STRUCTURE`         | `hcm.workforce-foundation` | David                     | Tenant                                                                                   |
| `hcm.workforce-foundation.org-chart.read`            | `ORG_CHART`                      | `hcm.workforce-foundation` | Jim, Michael, Toby, David | Organization                                                                             |
| `hcm.job-architecture.catalogue.read`                | `JOB_CATALOGUE`                  | `hcm.job-architecture`     | David, Toby               | Tenant                                                                                   |
| `hcm.job-architecture.catalogue.manage`              | `JOB_CATALOGUE`                  | `hcm.job-architecture`     | David                     | Tenant                                                                                   |
| `hcm.job-architecture.catalogue.publish`             | `JOB_CATALOGUE`                  | `hcm.job-architecture`     | David                     | Tenant                                                                                   |
| `hcm.job-architecture.positions.read`                | `POSITIONS`                      | `hcm.job-architecture`     | Toby, David               | Tenant                                                                                   |
| `hcm.job-architecture.positions.request`             | `POSITIONS`                      | `hcm.job-architecture`     | Toby                      | Tenant                                                                                   |
| `hcm.job-architecture.positions.approve`             | `POSITIONS`                      | `hcm.job-architecture`     | David                     | Tenant; one independent approver per request (DEC-HCM2-008)                              |
| `hcm.job-architecture.position-requirements.read`    | `POSITION_REQUIREMENTS`          | `hcm.job-architecture`     | Toby, David               | Tenant                                                                                   |
| `hcm.job-architecture.position-requirements.request` | `POSITION_REQUIREMENTS`          | `hcm.job-architecture`     | Toby                      | Tenant                                                                                   |
| `hcm.job-architecture.position-requirements.waive`   | `POSITION_REQUIREMENTS`          | `hcm.job-architecture`     | David                     | Tenant; required with positions.approve for requests containing a Waive (DEC-HCM2-009)   |
| `hcm.employee.directory.read`                        | `EMPLOYEE_DIRECTORY`             | `hcm.employee`             | Jim, Michael, Toby, David | Organization                                                                             |
| `hcm.employee.team.read`                             | `TEAM_DIRECTORY`                 | `hcm.employee`             | Michael                   | Team: direct reports through current primary solid lines (DEC-HCM2-015)                  |
| `hcm.employee.profile.self.read`                     | `MY_PROFILE`                     | `hcm.employee`             | Jim, Michael, Toby, David | Self                                                                                     |
| `hcm.employee.profile.self.manage`                   | `MY_PROFILE`                     | `hcm.employee`             | Jim, Michael, Toby, David | Self; only Direct self-edit fields                                                       |
| `hcm.employee.records.read`                          | `EMPLOYEE_RECORDS`               | `hcm.employee`             | Toby                      | Tenant; HR relation                                                                      |
| `hcm.employee.records.manage`                        | `EMPLOYEE_RECORDS`               | `hcm.employee`             | Toby                      | Tenant; person facts and worker creation                                                 |
| `hcm.employee.records.emergency.read`                | `EMPLOYEE_RECORDS`               | `hcm.employee`             | Toby                      | Tenant; purpose-bound, audited                                                           |
| `hcm.employee.profile-configuration.read`            | `EMPLOYEE_PROFILE_CONFIGURATION` | `hcm.employee`             | Toby, David               | Tenant                                                                                   |
| `hcm.employee.profile-configuration.manage`          | `EMPLOYEE_PROFILE_CONFIGURATION` | `hcm.employee`             | Toby                      | Tenant                                                                                   |
| `hcm.employee.import.read`                           | `EMPLOYEE_IMPORT`                | `hcm.employee`             | Toby                      | Tenant                                                                                   |
| `hcm.employee.import.manage`                         | `EMPLOYEE_IMPORT`                | `hcm.employee`             | Toby                      | Tenant                                                                                   |
| `hcm.employee.changes.read`                          | `EMPLOYMENT_CHANGES`             | `hcm.employee`             | Toby, David               | Tenant                                                                                   |
| `hcm.employee.changes.request`                       | `EMPLOYMENT_CHANGES`             | `hcm.employee`             | Toby                      | Tenant                                                                                   |
| `hcm.employee.changes.approve`                       | `EMPLOYMENT_CHANGES`             | `hcm.employee`             | David                     | Tenant; one independent approver for every change type, never own request (DEC-HCM2-002) |
| `hcm.employee.probation.read`                        | `PROBATION_MANAGEMENT`           | `hcm.employee`             | Toby                      | Tenant                                                                                   |
| `hcm.employee.probation.manage`                      | `PROBATION_MANAGEMENT`           | `hcm.employee`             | Toby                      | Tenant                                                                                   |
| `hcm.employee.probation.review`                      | `PROBATION_REVIEW`               | `hcm.employee`             | Michael                   | Assigned reviewer only                                                                   |
| `hcm.employee.hr-service.handle`                     | `HR_SERVICE_DESK`                | `hcm.employee`             | Toby                      | Tenant requests of accessible types; internal content                                    |
| `hcm.employee.hr-service.configure`                  | `HR_SERVICE_DESK`                | `hcm.employee`             | Toby                      | Tenant configuration                                                                     |
| `hcm.employee.hr-requests.self.read`                 | `MY_HR_REQUESTS`                 | `hcm.employee`             | Jim, Michael, Toby, David | Self; employee-visible content only                                                      |
| `hcm.employee.hr-requests.self.manage`               | `MY_HR_REQUESTS`                 | `hcm.employee`             | Jim, Michael, Toby, David | Self                                                                                     |

The three entitlement codes already exist among the 26 seeded entitlement
definitions. Each app keeps its existing `hcm.catalogue.<APP>.discover`
permission, which never authorizes business APIs.

## SAFETY

- An HR permission never includes self-approval. A requester cannot satisfy an
  approval slot of their own request, and one approver cannot hold two slots.
- `records.read` does not reveal emergency-purpose values. Those need
  `records.emergency.read`, a stated purpose and a `sensitive-access` audit event.
- Team and Assigned scopes are recomputed per request. Removing a reporting line
  or reviewer assignment denies the next request.
- David receives no HR records, probation or service-desk content by default,
  continuing the HCM-1 separation of administration from HR content.
