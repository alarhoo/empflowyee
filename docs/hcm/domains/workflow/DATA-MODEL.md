# Workflow & Approvals — Logical Data Model

Current-release applicability: the [approved decisions](../../roadmap/HCM-3-DECISIONS.md#decisions) and [owning technical design](TECHNICAL-DESIGN.md) explicitly exclude future logical entities/transitions for offline/device/geofence capture, auto-close, pooled claim/release, delegation creation, new step-up and encashment payment/handoff. Broader logical state/table catalogues below are not permission to implement those capabilities. Physical identity and exact-duration mappings are specified by the SQL TDD; Unpaid tracking is an explicit exception to account/reservation transitions.

This logical catalogue defines reusable coordination facts. It is not DDL and must not copy source-domain request/evidence payloads into workflow tables.

## WorkflowSubjectType

| Field              | Type      | Constraints | Meaning |
| ------------------ | --------- | ----------- | ------- |
| `Id`               | `int`     | PK          | —       |
| `Code`             | `string`  | UK          | —       |
| `SourceModuleCode` | `string`  | —           | —       |
| `DisplayName`      | `string`  | —           | —       |
| `IsActive`         | `boolean` | —           | —       |

## WorkflowSubjectContractVersion

| Field                   | Type       | Constraints | Meaning                              |
| ----------------------- | ---------- | ----------- | ------------------------------------ |
| `Id`                    | `int`      | PK          | —                                    |
| `WorkflowSubjectTypeId` | `int`      | FK          | —                                    |
| `ContractVersion`       | `string`   | —           | —                                    |
| `DefinitionMode`        | `string`   | —           | DomainManifest \| WorkflowDefinition |
| `SensitivityCeiling`    | `string`   | —           | Internal \| Personal \| Restricted   |
| `DeepLinkRouteCode`     | `string`   | —           | —                                    |
| `IsActive`              | `boolean`  | —           | —                                    |
| `ReleasedAt`            | `datetime` | —           | —                                    |
| `RetiredAt`             | `datetime` | —           | —                                    |

## WorkflowSubjectAction

| Field                              | Type      | Constraints | Meaning                                         |
| ---------------------------------- | --------- | ----------- | ----------------------------------------------- |
| `Id`                               | `int`     | PK          | —                                               |
| `WorkflowSubjectContractVersionId` | `int`     | FK          | —                                               |
| `Code`                             | `string`  | —           | —                                               |
| `TaskKind`                         | `string`  | —           | Approval \| Review \| Acknowledgement \| Action |
| `IsActive`                         | `boolean` | —           | —                                               |

## WorkflowSubjectFact

| Field                              | Type      | Constraints | Meaning                              |
| ---------------------------------- | --------- | ----------- | ------------------------------------ |
| `Id`                               | `int`     | PK          | —                                    |
| `WorkflowSubjectContractVersionId` | `int`     | FK          | —                                    |
| `Code`                             | `string`  | —           | —                                    |
| `DataType`                         | `string`  | —           | String \| Decimal \| Boolean \| Date |
| `Sensitivity`                      | `string`  | —           | Internal \| Personal \| Restricted   |
| `IsActive`                         | `boolean` | —           | —                                    |

## WorkflowDefinition

| Field                   | Type       | Constraints | Meaning           |
| ----------------------- | ---------- | ----------- | ----------------- |
| `Id`                    | `int`      | PK          | —                 |
| `PublicId`              | `uuid`     | UK          | —                 |
| `TenantId`              | `int`      | FK          | —                 |
| `OrganizationId`        | `int`      | FK          | —                 |
| `WorkflowSubjectTypeId` | `int`      | FK          | —                 |
| `Code`                  | `string`   | UK          | —                 |
| `Name`                  | `string`   | —           | —                 |
| `Description`           | `string`   | —           | —                 |
| `Status`                | `string`   | —           | Active \| Retired |
| `CreatedAt`             | `datetime` | —           | —                 |
| `CreatedBy`             | `string`   | —           | —                 |
| `UpdatedAt`             | `datetime` | —           | —                 |
| `UpdatedBy`             | `string`   | —           | —                 |

## WorkflowDefinitionVersion

| Field                                   | Type       | Constraints | Meaning                       |
| --------------------------------------- | ---------- | ----------- | ----------------------------- |
| `Id`                                    | `int`      | PK          | —                             |
| `PublicId`                              | `uuid`     | UK          | —                             |
| `TenantId`                              | `int`      | FK          | —                             |
| `WorkflowDefinitionId`                  | `int`      | FK          | —                             |
| `WorkflowSubjectContractVersionId`      | `int`      | FK          | —                             |
| `VersionNumber`                         | `int`      | —           | —                             |
| `Status`                                | `string`   | —           | Draft \| Published \| Retired |
| `EffectiveFromDate`                     | `date`     | —           | —                             |
| `EffectiveToDate`                       | `date`     | —           | —                             |
| `DurationBasis`                         | `string`   | —           | Elapsed \| BusinessCalendar   |
| `BusinessCalendarPublicReference`       | `string`   | —           | —                             |
| `DefinitionDigest`                      | `string`   | —           | —                             |
| `SupersedesWorkflowDefinitionVersionId` | `int`      | FK          | —                             |
| `PublishedAt`                           | `datetime` | —           | —                             |
| `PublishedByUserAccountId`              | `int`      | FK          | —                             |
| `Version`                               | `int`      | —           | —                             |
| `CreatedAt`                             | `datetime` | —           | —                             |
| `CreatedBy`                             | `string`   | —           | —                             |
| `UpdatedAt`                             | `datetime` | —           | —                             |
| `UpdatedBy`                             | `string`   | —           | —                             |

## WorkflowStageDefinition

| Field                         | Type       | Constraints | Meaning                    |
| ----------------------------- | ---------- | ----------- | -------------------------- |
| `Id`                          | `int`      | PK          | —                          |
| `PublicId`                    | `uuid`     | UK          | —                          |
| `TenantId`                    | `int`      | FK          | —                          |
| `WorkflowDefinitionVersionId` | `int`      | FK          | —                          |
| `StageNumber`                 | `int`      | —           | —                          |
| `Code`                        | `string`   | —           | —                          |
| `Name`                        | `string`   | —           | —                          |
| `CompletionMode`              | `string`   | —           | All \| Any \| MinimumCount |
| `RequiredActionCount`         | `int`      | —           | —                          |
| `RejectionMode`               | `string`   | —           | AnyRejects \| MinimumCount |
| `RequiredRejectionCount`      | `int`      | —           | —                          |
| `DueAfterMinutes`             | `int`      | —           | —                          |
| `CreatedAt`                   | `datetime` | —           | —                          |
| `CreatedBy`                   | `string`   | —           | —                          |
| `UpdatedAt`                   | `datetime` | —           | —                          |
| `UpdatedBy`                   | `string`   | —           | —                          |

## WorkflowTaskDefinition

| Field                       | Type       | Constraints | Meaning                                         |
| --------------------------- | ---------- | ----------- | ----------------------------------------------- |
| `Id`                        | `int`      | PK          | —                                               |
| `PublicId`                  | `uuid`     | UK          | —                                               |
| `TenantId`                  | `int`      | FK          | —                                               |
| `WorkflowStageDefinitionId` | `int`      | FK          | —                                               |
| `SlotCode`                  | `string`   | —           | —                                               |
| `Name`                      | `string`   | —           | —                                               |
| `TaskKind`                  | `string`   | —           | Approval \| Review \| Acknowledgement \| Action |
| `AssignmentMode`            | `string`   | —           | Direct \| OfferToCandidates \| ClaimFromPool    |
| `IsRequired`                | `boolean`  | —           | —                                               |
| `ReasonRequiredOnReject`    | `boolean`  | —           | —                                               |
| `ReasonRequiredOnAction`    | `boolean`  | —           | —                                               |
| `Sensitivity`               | `string`   | —           | Internal \| Personal \| Restricted              |
| `SortOrder`                 | `int`      | —           | —                                               |
| `CreatedAt`                 | `datetime` | —           | —                                               |
| `CreatedBy`                 | `string`   | —           | —                                               |
| `UpdatedAt`                 | `datetime` | —           | —                                               |
| `UpdatedBy`                 | `string`   | —           | —                                               |

## WorkflowTaskDefinitionAction

| Field                      | Type       | Constraints | Meaning |
| -------------------------- | ---------- | ----------- | ------- |
| `Id`                       | `int`      | PK          | —       |
| `TenantId`                 | `int`      | FK          | —       |
| `WorkflowTaskDefinitionId` | `int`      | FK          | —       |
| `WorkflowSubjectActionId`  | `int`      | FK          | —       |
| `SortOrder`                | `int`      | —           | —       |
| `CreatedAt`                | `datetime` | —           | —       |
| `CreatedBy`                | `string`   | —           | —       |

## WorkflowConditionGroup

| Field                       | Type       | Constraints | Meaning            |
| --------------------------- | ---------- | ----------- | ------------------ |
| `Id`                        | `int`      | PK          | —                  |
| `PublicId`                  | `uuid`     | UK          | —                  |
| `TenantId`                  | `int`      | FK          | —                  |
| `WorkflowStageDefinitionId` | `int`      | FK          | —                  |
| `WorkflowTaskDefinitionId`  | `int`      | FK          | —                  |
| `SortOrder`                 | `int`      | —           | —                  |
| `Effect`                    | `string`   | —           | Include \| Exclude |
| `CombineMode`               | `string`   | —           | All \| Any         |
| `CreatedAt`                 | `datetime` | —           | —                  |
| `CreatedBy`                 | `string`   | —           | —                  |

## WorkflowCondition

| Field                      | Type       | Constraints | Meaning                                                                       |
| -------------------------- | ---------- | ----------- | ----------------------------------------------------------------------------- |
| `Id`                       | `int`      | PK          | —                                                                             |
| `TenantId`                 | `int`      | FK          | —                                                                             |
| `WorkflowConditionGroupId` | `int`      | FK          | —                                                                             |
| `WorkflowSubjectFactId`    | `int`      | FK          | —                                                                             |
| `SortOrder`                | `int`      | —           | —                                                                             |
| `Operator`                 | `string`   | —           | Equals \| NotEquals \| GreaterThan \| AtLeast \| LessThan \| AtMost \| Exists |
| `StringOperand`            | `string`   | —           | —                                                                             |
| `DecimalOperand`           | `decimal`  | —           | —                                                                             |
| `BooleanOperand`           | `boolean`  | —           | —                                                                             |
| `DateOperand`              | `date`     | —           | —                                                                             |
| `CreatedAt`                | `datetime` | —           | —                                                                             |
| `CreatedBy`                | `string`   | —           | —                                                                             |

## WorkflowRoutingRule

| Field                          | Type       | Constraints | Meaning                                                                 |
| ------------------------------ | ---------- | ----------- | ----------------------------------------------------------------------- |
| `Id`                           | `int`      | PK          | —                                                                       |
| `PublicId`                     | `uuid`     | UK          | —                                                                       |
| `TenantId`                     | `int`      | FK          | —                                                                       |
| `WorkflowTaskDefinitionId`     | `int`      | FK          | —                                                                       |
| `Priority`                     | `int`      | —           | —                                                                       |
| `Source`                       | `string`   | —           | LineManager \| ManagerLevel \| Function \| NamedUser \| DomainCandidate |
| `ManagerLevel`                 | `int`      | —           | —                                                                       |
| `FunctionCode`                 | `string`   | —           | —                                                                       |
| `NamedUserAccountId`           | `int`      | FK          | —                                                                       |
| `OnNoCandidate`                | `string`   | —           | Continue \| Fail \| Escalate \| OperationsQueue                         |
| `RequireDistinctFromRequester` | `boolean`  | —           | —                                                                       |
| `RequireDistinctFromSubject`   | `boolean`  | —           | —                                                                       |
| `CreatedAt`                    | `datetime` | —           | —                                                                       |
| `CreatedBy`                    | `string`   | —           | —                                                                       |

## WorkflowEscalationRule

| Field                      | Type       | Constraints | Meaning                                                                              |
| -------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------ |
| `Id`                       | `int`      | PK          | —                                                                                    |
| `PublicId`                 | `uuid`     | UK          | —                                                                                    |
| `TenantId`                 | `int`      | FK          | —                                                                                    |
| `WorkflowTaskDefinitionId` | `int`      | FK          | —                                                                                    |
| `SequenceNumber`           | `int`      | —           | —                                                                                    |
| `AfterMinutes`             | `int`      | —           | —                                                                                    |
| `Action`                   | `string`   | —           | Remind \| NotifySupervisor \| AddCandidates \| Reassign \| OperationsQueue \| Expire |
| `TargetSource`             | `string`   | —           | CurrentAssignee \| CandidateSupervisor \| Function \| NamedUser \| Operations        |
| `TargetFunctionCode`       | `string`   | —           | —                                                                                    |
| `TargetUserAccountId`      | `int`      | FK          | —                                                                                    |
| `RepeatEveryMinutes`       | `int`      | —           | —                                                                                    |
| `MaximumRepeatCount`       | `int`      | —           | —                                                                                    |
| `CreatedAt`                | `datetime` | —           | —                                                                                    |
| `CreatedBy`                | `string`   | —           | —                                                                                    |

## WorkflowDefinitionImpactPreview

| Field                         | Type       | Constraints | Meaning                                           |
| ----------------------------- | ---------- | ----------- | ------------------------------------------------- |
| `Id`                          | `int`      | PK          | —                                                 |
| `PublicId`                    | `uuid`     | UK          | —                                                 |
| `TenantId`                    | `int`      | FK          | —                                                 |
| `WorkflowDefinitionVersionId` | `int`      | FK          | —                                                 |
| `Status`                      | `string`   | —           | Running \| Ready \| Failed \| Expired \| Consumed |
| `SourceConfigurationVersion`  | `string`   | —           | —                                                 |
| `DefinitionDigest`            | `string`   | —           | —                                                 |
| `EvaluatedSubjectCount`       | `int`      | —           | —                                                 |
| `NoCandidateCount`            | `int`      | —           | —                                                 |
| `InvalidRouteCount`           | `int`      | —           | —                                                 |
| `InFlightImpactCount`         | `int`      | —           | —                                                 |
| `ImpactDigest`                | `string`   | —           | —                                                 |
| `RequestedAt`                 | `datetime` | —           | —                                                 |
| `RequestedByUserAccountId`    | `int`      | FK          | —                                                 |
| `CompletedAt`                 | `datetime` | —           | —                                                 |
| `ExpiresAt`                   | `datetime` | —           | —                                                 |
| `FailureCode`                 | `string`   | —           | —                                                 |
| `CreatedAt`                   | `datetime` | —           | —                                                 |
| `UpdatedAt`                   | `datetime` | —           | —                                                 |

## WorkflowInstance

| Field                              | Type       | Constraints | Meaning                                                 |
| ---------------------------------- | ---------- | ----------- | ------------------------------------------------------- |
| `Id`                               | `int`      | PK          | —                                                       |
| `PublicId`                         | `uuid`     | UK          | —                                                       |
| `TenantId`                         | `int`      | FK          | —                                                       |
| `WorkflowSubjectTypeId`            | `int`      | FK          | —                                                       |
| `WorkflowSubjectContractVersionId` | `int`      | FK          | —                                                       |
| `WorkflowDefinitionVersionId`      | `int`      | FK          | NULL only for a registered DomainManifest subject       |
| `SourceCasePublicReference`        | `string`   | —           | —                                                       |
| `GenerationNumber`                 | `int`      | —           | —                                                       |
| `SourceCaseVersion`                | `int`      | —           | —                                                       |
| `SubjectPublicReference`           | `string`   | —           | —                                                       |
| `SubjectEmploymentId`              | `int`      | FK          | —                                                       |
| `RequesterUserAccountId`           | `int`      | FK          | —                                                       |
| `DisplayReference`                 | `string`   | —           | —                                                       |
| `EncryptedDisplaySummary`          | `string`   | —           | —                                                       |
| `Sensitivity`                      | `string`   | —           | Internal \| Personal \| Restricted                      |
| `Status`                           | `string`   | —           | Open \| Completed \| Cancelled \| Invalidated \| Failed |
| `CurrentStageNumber`               | `int`      | —           | —                                                       |
| `ManifestDigest`                   | `string`   | —           | —                                                       |
| `DisplayProjectionVersion`         | `string`   | —           | —                                                       |
| `IdempotencyKey`                   | `string`   | —           | —                                                       |
| `Version`                          | `int`      | —           | —                                                       |
| `OpenedAt`                         | `datetime` | —           | —                                                       |
| `ClosedAt`                         | `datetime` | —           | —                                                       |
| `CreatedAt`                        | `datetime` | —           | —                                                       |
| `UpdatedAt`                        | `datetime` | —           | —                                                       |

## WorkflowInstanceFact

| Field                   | Type       | Constraints | Meaning |
| ----------------------- | ---------- | ----------- | ------- |
| `Id`                    | `int`      | PK          | —       |
| `TenantId`              | `int`      | FK          | —       |
| `WorkflowInstanceId`    | `int`      | FK          | —       |
| `WorkflowSubjectFactId` | `int`      | FK          | —       |
| `StringValue`           | `string`   | —           | —       |
| `DecimalValue`          | `decimal`  | —           | —       |
| `BooleanValue`          | `boolean`  | —           | —       |
| `DateValue`             | `date`     | —           | —       |
| `SourceVersion`         | `string`   | —           | —       |
| `CreatedAt`             | `datetime` | —           | —       |

## WorkflowStageInstance

| Field                       | Type       | Constraints | Meaning                                                                |
| --------------------------- | ---------- | ----------- | ---------------------------------------------------------------------- |
| `Id`                        | `int`      | PK          | —                                                                      |
| `PublicId`                  | `uuid`     | UK          | —                                                                      |
| `TenantId`                  | `int`      | FK          | —                                                                      |
| `WorkflowInstanceId`        | `int`      | FK          | —                                                                      |
| `WorkflowStageDefinitionId` | `int`      | FK          | NULL only for a DomainManifest generation                              |
| `StageNumber`               | `int`      | —           | —                                                                      |
| `StageCode`                 | `string`   | —           | —                                                                      |
| `CompletionMode`            | `string`   | —           | All \| Any \| MinimumCount                                             |
| `RequiredActionCount`       | `int`      | —           | —                                                                      |
| `Status`                    | `string`   | —           | Blocked \| Active \| Completed \| Rejected \| Cancelled \| Invalidated |
| `ActivatedAt`               | `datetime` | —           | —                                                                      |
| `CompletedAt`               | `datetime` | —           | —                                                                      |
| `CreatedAt`                 | `datetime` | —           | —                                                                      |
| `UpdatedAt`                 | `datetime` | —           | —                                                                      |

## WorkflowTask

| Field                             | Type       | Constraints | Meaning                                                                                                    |
| --------------------------------- | ---------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `Id`                              | `int`      | PK          | —                                                                                                          |
| `PublicId`                        | `uuid`     | UK          | —                                                                                                          |
| `TenantId`                        | `int`      | FK          | —                                                                                                          |
| `WorkflowStageInstanceId`         | `int`      | FK          | —                                                                                                          |
| `WorkflowTaskDefinitionId`        | `int`      | FK          | NULL only for a DomainManifest generation                                                                  |
| `SlotCode`                        | `string`   | —           | —                                                                                                          |
| `TaskKind`                        | `string`   | —           | Approval \| Review \| Acknowledgement \| Action                                                            |
| `AssignmentMode`                  | `string`   | —           | Direct \| OfferToCandidates \| ClaimFromPool                                                               |
| `Status`                          | `string`   | —           | Blocked \| Ready \| Claimed \| ActionPending \| Completed \| Cancelled \| Invalidated \| Expired \| Failed |
| `EncryptedTitle`                  | `string`   | —           | —                                                                                                          |
| `Sensitivity`                     | `string`   | —           | Internal \| Personal \| Restricted                                                                         |
| `ExpectedSourceCaseVersion`       | `int`      | —           | —                                                                                                          |
| `AvailableAt`                     | `datetime` | —           | —                                                                                                          |
| `DueAt`                           | `datetime` | —           | —                                                                                                          |
| `CompletedAt`                     | `datetime` | —           | —                                                                                                          |
| `CompletedByWorkflowTaskActionId` | `int`      | FK          | Set only after an accepted source result                                                                   |
| `Version`                         | `int`      | —           | —                                                                                                          |
| `CreatedAt`                       | `datetime` | —           | —                                                                                                          |
| `UpdatedAt`                       | `datetime` | —           | —                                                                                                          |

## WorkflowTaskAction

| Field                     | Type       | Constraints | Meaning |
| ------------------------- | ---------- | ----------- | ------- |
| `Id`                      | `int`      | PK          | —       |
| `TenantId`                | `int`      | FK          | —       |
| `WorkflowTaskId`          | `int`      | FK          | —       |
| `WorkflowSubjectActionId` | `int`      | FK          | —       |
| `SortOrder`               | `int`      | —           | —       |
| `CreatedAt`               | `datetime` | —           | —       |

## WorkflowTaskCandidate

| Field                      | Type       | Constraints | Meaning                        |
| -------------------------- | ---------- | ----------- | ------------------------------ |
| `Id`                       | `int`      | PK          | —                              |
| `PublicId`                 | `uuid`     | UK          | —                              |
| `TenantId`                 | `int`      | FK          | —                              |
| `WorkflowTaskId`           | `int`      | FK          | —                              |
| `UserAccountId`            | `int`      | FK          | —                              |
| `RoutingSource`            | `string`   | —           | —                              |
| `AuthorityPublicReference` | `string`   | —           | —                              |
| `Status`                   | `string`   | —           | Eligible \| Removed \| Expired |
| `ResolvedAt`               | `datetime` | —           | —                              |
| `ValidUntil`               | `datetime` | —           | —                              |
| `RemovedAt`                | `datetime` | —           | —                              |
| `RemovalReason`            | `string`   | —           | —                              |
| `CreatedAt`                | `datetime` | —           | —                              |
| `UpdatedAt`                | `datetime` | —           | —                              |

## WorkflowTaskAssignment

| Field                     | Type       | Constraints | Meaning                                                 |
| ------------------------- | ---------- | ----------- | ------------------------------------------------------- |
| `Id`                      | `int`      | PK          | —                                                       |
| `PublicId`                | `uuid`     | UK          | —                                                       |
| `TenantId`                | `int`      | FK          | —                                                       |
| `WorkflowTaskId`          | `int`      | FK          | —                                                       |
| `WorkflowTaskCandidateId` | `int`      | FK          | NULL only for restricted operations ownership           |
| `AssignedToUserAccountId` | `int`      | FK          | —                                                       |
| `AssignmentSource`        | `string`   | —           | Direct \| Claim \| Reassign \| Escalation \| Operations |
| `Status`                  | `string`   | —           | Active \| Released \| Completed \| Revoked              |
| `AssignedAt`              | `datetime` | —           | —                                                       |
| `AssignedByUserAccountId` | `int`      | FK          | —                                                       |
| `EndedAt`                 | `datetime` | —           | —                                                       |
| `EndReason`               | `string`   | —           | —                                                       |
| `CreatedAt`               | `datetime` | —           | —                                                       |
| `UpdatedAt`               | `datetime` | —           | —                                                       |

## WorkflowActionAttempt

| Field                       | Type       | Constraints | Meaning                                                               |
| --------------------------- | ---------- | ----------- | --------------------------------------------------------------------- |
| `Id`                        | `int`      | PK          | —                                                                     |
| `PublicId`                  | `uuid`     | UK          | —                                                                     |
| `TenantId`                  | `int`      | FK          | —                                                                     |
| `WorkflowTaskId`            | `int`      | FK          | —                                                                     |
| `WorkflowTaskActionId`      | `int`      | FK          | —                                                                     |
| `ActorUserAccountId`        | `int`      | FK          | —                                                                     |
| `EncryptedReason`           | `string`   | —           | —                                                                     |
| `AuthorityPublicReference`  | `string`   | —           | —                                                                     |
| `AssuranceLevel`            | `string`   | —           | —                                                                     |
| `ExpectedSourceCaseVersion` | `int`      | —           | —                                                                     |
| `IdempotencyKey`            | `string`   | —           | —                                                                     |
| `InputDigest`               | `string`   | —           | —                                                                     |
| `Status`                    | `string`   | —           | Accepted \| Dispatching \| Confirmed \| Rejected \| Failed \| Unknown |
| `FailureCode`               | `string`   | —           | —                                                                     |
| `AttemptedAt`               | `datetime` | —           | —                                                                     |
| `CompletedAt`               | `datetime` | —           | —                                                                     |
| `CreatedAt`                 | `datetime` | —           | —                                                                     |

## WorkflowActionDispatch

| Field                     | Type       | Constraints | Meaning                                                            |
| ------------------------- | ---------- | ----------- | ------------------------------------------------------------------ |
| `Id`                      | `int`      | PK          | —                                                                  |
| `PublicId`                | `uuid`     | UK          | —                                                                  |
| `TenantId`                | `int`      | FK          | —                                                                  |
| `WorkflowActionAttemptId` | `int`      | FK          | —                                                                  |
| `SourceModuleCode`        | `string`   | —           | —                                                                  |
| `AdapterContractVersion`  | `string`   | —           | —                                                                  |
| `SignedCommandDigest`     | `string`   | —           | —                                                                  |
| `IdempotencyKey`          | `string`   | —           | —                                                                  |
| `Status`                  | `string`   | —           | Pending \| Sent \| Acknowledged \| Failed \| Unknown \| DeadLetter |
| `AttemptCount`            | `int`      | —           | —                                                                  |
| `NextAttemptAt`           | `datetime` | —           | —                                                                  |
| `SentAt`                  | `datetime` | —           | —                                                                  |
| `AcknowledgedAt`          | `datetime` | —           | —                                                                  |
| `FailureCode`             | `string`   | —           | —                                                                  |
| `CreatedAt`               | `datetime` | —           | —                                                                  |
| `UpdatedAt`               | `datetime` | —           | —                                                                  |

## WorkflowActionReceipt

| Field                      | Type       | Constraints | Meaning                                                                   |
| -------------------------- | ---------- | ----------- | ------------------------------------------------------------------------- |
| `Id`                       | `int`      | PK          | —                                                                         |
| `PublicId`                 | `uuid`     | UK          | —                                                                         |
| `TenantId`                 | `int`      | FK          | —                                                                         |
| `WorkflowActionDispatchId` | `int`      | FK          | —                                                                         |
| `SequenceNumber`           | `int`      | —           | —                                                                         |
| `SourceEventId`            | `string`   | —           | —                                                                         |
| `Outcome`                  | `string`   | —           | Accepted \| Denied \| Stale \| Conflict \| CaseClosed \| RetryableFailure |
| `SourceCaseVersionAfter`   | `int`      | —           | —                                                                         |
| `SourceStateCode`          | `string`   | —           | —                                                                         |
| `ResultDigest`             | `string`   | —           | —                                                                         |
| `SignatureKeyId`           | `string`   | —           | —                                                                         |
| `ReceivedAt`               | `datetime` | —           | —                                                                         |
| `CreatedAt`                | `datetime` | —           | —                                                                         |

## WorkflowTimer

| Field                      | Type       | Constraints | Meaning                                                 |
| -------------------------- | ---------- | ----------- | ------------------------------------------------------- |
| `Id`                       | `int`      | PK          | —                                                       |
| `PublicId`                 | `uuid`     | UK          | —                                                       |
| `TenantId`                 | `int`      | FK          | —                                                       |
| `WorkflowTaskId`           | `int`      | FK          | —                                                       |
| `WorkflowEscalationRuleId` | `int`      | FK          | NULL for base Due/Expiry timers from the task manifest  |
| `TimerType`                | `string`   | —           | Due \| Reminder \| Escalation \| Expiry                 |
| `Status`                   | `string`   | —           | Scheduled \| Processing \| Fired \| Cancelled \| Failed |
| `DueAt`                    | `datetime` | —           | —                                                       |
| `FireCount`                | `int`      | —           | —                                                       |
| `IdempotencyKey`           | `string`   | —           | —                                                       |
| `LastFiredAt`              | `datetime` | —           | —                                                       |
| `NextAttemptAt`            | `datetime` | —           | —                                                       |
| `FailureCode`              | `string`   | —           | —                                                       |
| `CreatedAt`                | `datetime` | —           | —                                                       |
| `UpdatedAt`                | `datetime` | —           | —                                                       |

## WorkflowTaskEvent

| Field                | Type       | Constraints | Meaning                                                                                                                                                                          |
| -------------------- | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Id`                 | `int`      | PK          | —                                                                                                                                                                                |
| `PublicId`           | `uuid`     | UK          | —                                                                                                                                                                                |
| `TenantId`           | `int`      | FK          | —                                                                                                                                                                                |
| `WorkflowTaskId`     | `int`      | FK          | —                                                                                                                                                                                |
| `EventType`          | `string`   | —           | Created \| Activated \| Offered \| Assigned \| Claimed \| Released \| ActionAttempted \| ReminderSent \| Escalated \| Completed \| Cancelled \| Invalidated \| Expired \| Failed |
| `ActorUserAccountId` | `int`      | FK          | —                                                                                                                                                                                |
| `SafeDetailCode`     | `string`   | —           | —                                                                                                                                                                                |
| `OccurredAt`         | `datetime` | —           | —                                                                                                                                                                                |
| `CreatedAt`          | `datetime` | —           | —                                                                                                                                                                                |

## WorkflowReconciliationException

| Field                      | Type       | Constraints | Meaning                                                                                                                     |
| -------------------------- | ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Id`                       | `int`      | PK          | —                                                                                                                           |
| `PublicId`                 | `uuid`     | UK          | —                                                                                                                           |
| `TenantId`                 | `int`      | FK          | —                                                                                                                           |
| `WorkflowInstanceId`       | `int`      | FK          | —                                                                                                                           |
| `WorkflowTaskId`           | `int`      | FK          | —                                                                                                                           |
| `WorkflowActionDispatchId` | `int`      | FK          | —                                                                                                                           |
| `ExceptionType`            | `string`   | —           | MissingSource \| VersionDrift \| StateDrift \| OrphanTask \| CandidateDrift \| DispatchUnknown \| TimerDrift \| OutboxDrift |
| `Severity`                 | `string`   | —           | Warning \| Blocking                                                                                                         |
| `Status`                   | `string`   | —           | Open \| Investigating \| Resolved \| AcceptedRisk                                                                           |
| `SafeSummaryCode`          | `string`   | —           | —                                                                                                                           |
| `EvidenceDigest`           | `string`   | —           | —                                                                                                                           |
| `DetectedAt`               | `datetime` | —           | —                                                                                                                           |
| `AssignedToUserAccountId`  | `int`      | FK          | —                                                                                                                           |
| `ResolvedAt`               | `datetime` | —           | —                                                                                                                           |
| `ResolvedByUserAccountId`  | `int`      | FK          | —                                                                                                                           |
| `ResolutionCode`           | `string`   | —           | —                                                                                                                           |
| `CreatedAt`                | `datetime` | —           | —                                                                                                                           |
| `UpdatedAt`                | `datetime` | —           | —                                                                                                                           |

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.
