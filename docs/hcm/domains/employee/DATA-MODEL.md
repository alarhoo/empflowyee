# Employee — Logical Data Model

These entities extend Workforce Foundation without duplicating Person, Worker, Employment, Assignment or Reporting Line. The HCM-2 TDD maps them to SQL-first migrations and Kysely types.

## WorkforceProfileFieldDefinition

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `Code` | `string` | UK | Stable standard field code |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `SectionCode` | `string` | — | Identity \| Personal \| Contact \| Employment \| Assignment \| Other |
| `OwnerPhaseCode` | `string` | — | — |
| `SourceEntity` | `string` | — | — |
| `SourceAttribute` | `string` | — | — |
| `Sensitivity` | `string` | — | DirectorySafe \| Personal \| Sensitive \| Restricted |
| `MaximumVisibility` | `string` | — | Self \| Manager \| Hr \| Organization |
| `RequiredEntitlementCode` | `string` | — | — |
| `IsSearchableWhenVisible` | `boolean` | — | — |
| `IsActive` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## WorkforceProfileFieldDefaultPolicy

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `WorkforceProfileFieldDefinitionId` | `int` | FK | — |
| `RequirednessContext` | `string` | — | — |
| `Requiredness` | `string` | — | Optional \| Recommended \| Required \| Hidden |
| `Visibility` | `string` | — | Self \| Manager \| Hr \| Organization |
| `SelfEditMode` | `string` | — | Direct \| ServiceRequest \| NotEditable |
| `RequiresVerification` | `boolean` | — | — |
| `AllowWorkerVisibilityPreference` | `boolean` | — | — |
| `EffectiveFromAt` | `datetime` | — | — |
| `EffectiveUntilAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## TenantWorkforceProfileFieldPolicy

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `WorkforceProfileFieldDefinitionId` | `int` | FK | Exactly one standard/custom field |
| `WorkforceCustomFieldDefinitionId` | `int` | FK | — |
| `RequirednessContext` | `string` | — | — |
| `Requiredness` | `string` | — | Optional \| Recommended \| Required \| Hidden |
| `Visibility` | `string` | — | Self \| Manager \| Hr \| Organization |
| `SelfEditMode` | `string` | — | Direct \| ServiceRequest \| NotEditable |
| `RequiresVerification` | `boolean` | — | — |
| `AllowWorkerVisibilityPreference` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `EffectiveFromAt` | `datetime` | — | — |
| `EffectiveUntilAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## WorkerProfileVisibilityPreference

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | — |
| `WorkerId` | `int` | FK | References Workforce Foundation Worker |
| `WorkforceProfileFieldDefinitionId` | `int` | FK | Exactly one standard/custom field |
| `WorkforceCustomFieldDefinitionId` | `int` | FK | — |
| `Visibility` | `string` | — | Self \| Manager \| Hr \| Organization |
| `EffectiveFromAt` | `datetime` | — | — |
| `EffectiveUntilAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## WorkforceCustomFieldDefinition

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `Code` | `string` | UK | Unique per tenant/organization |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `OwnerScope` | `string` | — | Person \| Worker \| Employment \| Assignment |
| `DataType` | `string` | — | Text \| LongText \| Integer \| Decimal \| Date \| Boolean \| SingleSelect \| MultiSelect |
| `Sensitivity` | `string` | — | DirectorySafe \| Personal \| Sensitive \| Restricted |
| `SectionCode` | `string` | — | — |
| `IsSearchableWhenVisible` | `boolean` | — | — |
| `IsActive` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## WorkforceCustomFieldOption

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | — |
| `WorkforceCustomFieldDefinitionId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `Name` | `string` | — | — |
| `IsActive` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## WorkforceCustomFieldValue

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `WorkforceCustomFieldDefinitionId` | `int` | FK | — |
| `PersonId` | `int` | FK | Exactly one owner target; Workforce Foundation |
| `WorkerId` | `int` | FK | — |
| `EmploymentId` | `int` | FK | — |
| `AssignmentId` | `int` | FK | — |
| `TextValue` | `string` | — | Non-sensitive text only |
| `EncryptedValue` | `string` | — | Sensitive/restricted canonical typed value |
| `MaskedTextValue` | `string` | — | — |
| `IntegerValue` | `int` | — | — |
| `DecimalValue` | `decimal` | — | — |
| `DateValue` | `date` | — | — |
| `BooleanValue` | `boolean` | — | — |
| `EffectiveFromDate` | `date` | — | — |
| `EffectiveToDate` | `date` | — | — |
| `SupersededByWorkforceCustomFieldValueId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## WorkforceCustomFieldValueOption

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | — |
| `WorkforceCustomFieldValueId` | `int` | FK | — |
| `WorkforceCustomFieldOptionId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## EmployeeImportTemplate

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `VersionNumber` | `int` | — | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `FileFormat` | `string` | — | Csv \| Xlsx |
| `Status` | `string` | — | Draft \| Published \| Retired |
| `HasHeaderRow` | `boolean` | — | — |
| `DefaultDateFormat` | `string` | — | — |
| `DefaultTimeZone` | `string` | — | — |
| `SupersedesEmployeeImportTemplateId` | `int` | FK | — |
| `PublishedAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## EmployeeImportTemplateColumn

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | — |
| `EmployeeImportTemplateId` | `int` | FK | — |
| `SourceColumnName` | `string` | — | — |
| `SourceColumnOrdinal` | `int` | — | — |
| `WorkforceProfileFieldDefinitionId` | `int` | FK | — |
| `WorkforceCustomFieldDefinitionId` | `int` | FK | — |
| `TransformationCode` | `string` | — | Allow-listed deterministic transformation |
| `TransformationParameters` | `string` | — | — |
| `IsMatchKey` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## EmployeeImportRun

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `EmployeeImportTemplateId` | `int` | FK | — |
| `SourceDocumentId` | `int` | FK | References Documents Document |
| `Status` | `string` | — | Uploaded \| Parsing \| Validating \| ReadyToCommit \| Committing \| Completed \| CompletedWithErrors \| Failed \| Cancelled |
| `ParserVersion` | `string` | — | — |
| `SourceDigest` | `string` | — | — |
| `NormalizedRequestHash` | `string` | — | — |
| `IdempotencyKey` | `string` | — | — |
| `IntendedAction` | `string` | — | Create \| Update \| Upsert |
| `CreateInvitationBatch` | `boolean` | — | — |
| `TotalRowCount` | `int` | — | — |
| `ValidRowCount` | `int` | — | — |
| `InvalidRowCount` | `int` | — | — |
| `CommittedRowCount` | `int` | — | — |
| `FailedRowCount` | `int` | — | — |
| `SkippedRowCount` | `int` | — | — |
| `RequestedByUserAccountId` | `int` | FK | Workforce Foundation |
| `RequestedAt` | `datetime` | — | — |
| `ValidationCompletedAt` | `datetime` | — | — |
| `CommitRequestedByUserAccountId` | `int` | FK | — |
| `CommitRequestedAt` | `datetime` | — | — |
| `CompletedAt` | `datetime` | — | — |
| `FailureCode` | `string` | — | — |
| `CustomerSafeFailureDetail` | `string` | — | — |
| `Version` | `int` | — | — |
| `RetentionUntilDate` | `date` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `UpdatedAt` | `datetime` | — | — |

## EmployeeImportRow

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `EmployeeImportRunId` | `int` | FK | — |
| `SourceRowNumber` | `int` | — | — |
| `SourceRowDigest` | `string` | — | — |
| `MatchStatus` | `string` | — | NotRequired \| None \| Unique \| Ambiguous |
| `ProposedAction` | `string` | — | Create \| Update \| Skip \| Reject |
| `MatchedPersonId` | `int` | FK | Workforce Foundation |
| `MatchedWorkerId` | `int` | FK | — |
| `MatchedEmploymentId` | `int` | FK | — |
| `MatchedAssignmentId` | `int` | FK | — |
| `Status` | `string` | — | Parsed \| Valid \| Invalid \| Committing \| Committed \| CommitFailed \| Skipped |
| `RowIdempotencyKey` | `string` | — | — |
| `ResultPersonId` | `int` | FK | — |
| `ResultWorkerId` | `int` | FK | — |
| `ResultEmploymentId` | `int` | FK | — |
| `ResultAssignmentId` | `int` | FK | — |
| `ResultUserAccountId` | `int` | FK | — |
| `FailureCode` | `string` | — | — |
| `SafeResultSummary` | `string` | — | — |
| `CommittedAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `UpdatedAt` | `datetime` | — | — |

## EmployeeImportIssue

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `EmployeeImportRunId` | `int` | FK | — |
| `EmployeeImportRowId` | `int` | FK | — |
| `StandardFieldCode` | `string` | — | — |
| `WorkforceCustomFieldDefinitionId` | `int` | FK | — |
| `SourceColumnName` | `string` | — | — |
| `Severity` | `string` | — | Warning \| Error |
| `IssueCode` | `string` | — | — |
| `SafeMessage` | `string` | — | Never contains raw personal value |
| `IsBlocking` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |

## WorkforceInvitationBatch

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `EmployeeImportRunId` | `int` | FK | — |
| `Name` | `string` | — | — |
| `Status` | `string` | — | Open \| Completed \| CompletedWithErrors \| Cancelled |
| `RequestedByUserAccountId` | `int` | FK | — |
| `RequestedAt` | `datetime` | — | — |
| `TotalCount` | `int` | — | — |
| `AcceptedCount` | `int` | — | — |
| `FailedCount` | `int` | — | — |
| `CancelledCount` | `int` | — | — |
| `CompletedAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `UpdatedAt` | `datetime` | — | — |

## WorkforceInvitation

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `WorkforceInvitationBatchId` | `int` | FK | — |
| `WorkerId` | `int` | FK | Workforce Foundation |
| `UserAccountId` | `int` | FK | Workforce Foundation |
| `AttemptNumber` | `int` | — | — |
| `DestinationEmailMasked` | `string` | — | — |
| `DestinationEmailHash` | `string` | — | — |
| `Status` | `string` | — | Queued \| Issued \| Delivered \| Accepted \| Expired \| Cancelled \| Failed |
| `AuthenticationTokenPublicReference` | `string` | — | Identity Access non-secret reference |
| `NotificationPublicReference` | `string` | — | Notifications |
| `RequestedAt` | `datetime` | — | — |
| `IssuedAt` | `datetime` | — | — |
| `DeliveredAt` | `datetime` | — | — |
| `AcceptedAt` | `datetime` | — | — |
| `ExpiresAt` | `datetime` | — | — |
| `CancelledAt` | `datetime` | — | — |
| `CancellationReason` | `string` | — | — |
| `FailedAt` | `datetime` | — | — |
| `FailureCode` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |

## WorkforceChangeRequest

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `WorkerId` | `int` | FK | Workforce Foundation |
| `EmploymentId` | `int` | FK | — |
| `AssignmentId` | `int` | FK | — |
| `ChangeType` | `string` | — | Rehire \| Transfer \| Promotion \| Demotion \| LocationChange \| ManagerChange \| HoursChange \| EmploymentTypeChange \| Suspension \| ReturnToWork \| Correction |
| `EffectiveDate` | `date` | — | — |
| `ExpectedEmploymentVersion` | `int` | — | — |
| `ExpectedAssignmentVersion` | `int` | — | — |
| `TargetWorkerTypeId` | `int` | FK | — |
| `TargetLegalEntityId` | `int` | FK | — |
| `TargetEmploymentType` | `string` | — | — |
| `TargetEmploymentStatus` | `string` | — | — |
| `TargetContinuousServiceStartDate` | `date` | — | — |
| `TargetProbationEndDate` | `date` | — | — |
| `TargetNoticePeriodDays` | `int` | — | — |
| `TargetOrgUnitId` | `int` | FK | — |
| `TargetDepartmentId` | `int` | FK | — |
| `TargetDesignationId` | `int` | FK | — |
| `TargetWorkLocationId` | `int` | FK | — |
| `TargetWorkMode` | `string` | — | — |
| `TargetFullTimeEquivalent` | `decimal` | — | — |
| `TargetStandardHoursPerWeek` | `decimal` | — | — |
| `TargetManagerAssignmentId` | `int` | FK | — |
| `ReasonCode` | `string` | — | — |
| `ReasonDetail` | `string` | — | — |
| `EvidenceReference` | `string` | — | — |
| `Status` | `string` | — | Draft \| PendingApproval \| Approved \| Rejected \| Scheduled \| Executing \| Completed \| Failed \| Cancelled |
| `ApprovalPolicyCode` | `string` | — | — |
| `ApprovalPolicyVersion` | `int` | — | — |
| `RequestedByUserAccountId` | `int` | FK | — |
| `RequestedAt` | `datetime` | — | — |
| `ApprovedAt` | `datetime` | — | — |
| `ScheduledAt` | `datetime` | — | — |
| `ExecutionStartedAt` | `datetime` | — | — |
| `CompletedAt` | `datetime` | — | — |
| `FailureCode` | `string` | — | — |
| `FailureDetailRestricted` | `string` | — | — |
| `IdempotencyKey` | `string` | — | — |
| `Version` | `int` | — | — |
| `RetentionUntilDate` | `date` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `UpdatedAt` | `datetime` | — | — |

## WorkforceChangeApproval

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | — |
| `WorkforceChangeRequestId` | `int` | FK | — |
| `ApprovalSlotCode` | `string` | — | — |
| `DecidedByUserAccountId` | `int` | FK | — |
| `Decision` | `string` | — | Approved \| Rejected |
| `AuthorityCode` | `string` | — | — |
| `Reason` | `string` | — | — |
| `AssuranceLevel` | `string` | — | — |
| `DecidedAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |

## WorkforceChangeExecutionStep

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `WorkforceChangeRequestId` | `int` | FK | — |
| `StepCode` | `string` | — | Validated product-owned code |
| `SequenceNumber` | `int` | — | — |
| `Status` | `string` | — | Pending \| Running \| Succeeded \| Failed \| Skipped |
| `IdempotencyKey` | `string` | — | — |
| `InputHash` | `string` | — | — |
| `AttemptCount` | `int` | — | — |
| `StartedAt` | `datetime` | — | — |
| `CompletedAt` | `datetime` | — | — |
| `ResultEntityType` | `string` | — | — |
| `ResultEntityId` | `int` | — | — |
| `FailureCode` | `string` | — | — |
| `FailureDetailRestricted` | `string` | — | — |
| `LeaseOwner` | `string` | — | — |
| `FencingToken` | `int` | — | — |
| `LeaseExpiresAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `UpdatedAt` | `datetime` | — | — |

## ProbationReview

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `EmploymentId` | `int` | FK | Workforce Foundation |
| `SequenceNumber` | `int` | — | — |
| `ReviewType` | `string` | — | Midpoint \| Final \| Extension |
| `PeriodStartDate` | `date` | — | — |
| `PeriodEndDate` | `date` | — | — |
| `DueDate` | `date` | — | — |
| `Status` | `string` | — | Scheduled \| InProgress \| AssessmentSubmitted \| Decided \| Cancelled |
| `PrimaryReviewerUserAccountId` | `int` | FK | — |
| `PrimaryReviewerAssignmentId` | `int` | FK | — |
| `OpenedAt` | `datetime` | — | — |
| `AssessmentDueAt` | `datetime` | — | — |
| `DecidedAt` | `datetime` | — | — |
| `CancelledAt` | `datetime` | — | — |
| `CancellationReason` | `string` | — | — |
| `Version` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## ProbationAssessment

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `ProbationReviewId` | `int` | FK | — |
| `ReviewerUserAccountId` | `int` | FK | — |
| `ReviewerAssignmentId` | `int` | FK | — |
| `AssessmentVersion` | `int` | — | — |
| `Recommendation` | `string` | — | Confirm \| Extend \| Fail \| NoChange |
| `OverallRating` | `decimal` | — | — |
| `Strengths` | `string` | — | — |
| `Concerns` | `string` | — | — |
| `RecommendationReason` | `string` | — | — |
| `SubmittedAt` | `datetime` | — | — |
| `SupersededAt` | `datetime` | — | — |
| `SupersededByProbationAssessmentId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |

## ProbationDecision

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `ProbationReviewId` | `int` | FK | — |
| `Outcome` | `string` | — | Confirm \| Extend \| Fail \| NoChange |
| `EffectiveDate` | `date` | — | — |
| `ExtendedProbationEndDate` | `date` | — | — |
| `Reason` | `string` | — | — |
| `EvidenceReference` | `string` | — | — |
| `DecidedByUserAccountId` | `int` | FK | — |
| `DecidedAt` | `datetime` | — | — |
| `ResultEmploymentVersion` | `int` | — | — |
| `NextProbationReviewId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |

## HrServiceTeam

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `TimeZone` | `string` | — | — |
| `IsActive` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## HrServiceTeamMembership

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | — |
| `HrServiceTeamId` | `int` | FK | — |
| `UserAccountId` | `int` | FK | Workforce Foundation |
| `MembershipRole` | `string` | — | Agent \| Lead \| Manager |
| `EffectiveFromAt` | `datetime` | — | — |
| `EffectiveUntilAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## HrServiceRequestType

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `Category` | `string` | — | PersonalData \| Employment \| Document \| Payroll \| Leave \| Attendance \| Benefits \| Other |
| `OwningFunctionCode` | `string` | — | Deep-link/authority contract for module-owned work |
| `RequiredEntitlementCode` | `string` | — | — |
| `Audience` | `string` | — | AllWorkers \| Employees \| Contractors \| Managers \| Hr |
| `DataClassification` | `string` | — | Internal \| Personal \| Sensitive \| Restricted |
| `DefaultHrServiceTeamId` | `int` | FK | — |
| `HrServiceLevelPolicyId` | `int` | FK | — |
| `IsActive` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## HrServiceLevelPolicy

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `VersionNumber` | `int` | — | — |
| `Name` | `string` | — | — |
| `Priority` | `string` | — | P1 \| P2 \| P3 \| P4 |
| `CalendarReference` | `string` | — | — |
| `CalendarTimeZone` | `string` | — | — |
| `FirstResponseMinutes` | `int` | — | — |
| `NextResponseMinutes` | `int` | — | — |
| `ResolutionMinutes` | `int` | — | — |
| `PauseWhileWaitingForEmployee` | `boolean` | — | — |
| `ReopenWindowHours` | `int` | — | — |
| `Status` | `string` | — | Draft \| Published \| Retired |
| `EffectiveFromAt` | `datetime` | — | — |
| `EffectiveUntilAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## HrServiceRequest

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `RequestNumber` | `string` | UK | Opaque public reference, unique per tenant |
| `HrServiceRequestTypeId` | `int` | FK | — |
| `RequesterWorkerId` | `int` | FK | Workforce Foundation |
| `RequesterUserAccountId` | `int` | FK | — |
| `SubjectWorkerId` | `int` | FK | May differ for manager/HR-created request |
| `Origin` | `string` | — | Employee \| Manager \| Hr \| Api \| System |
| `Priority` | `string` | — | P1 \| P2 \| P3 \| P4 |
| `Subject` | `string` | — | — |
| `Status` | `string` | — | New \| Open \| WaitingForEmployee \| WaitingForHr \| Resolved \| Closed \| Cancelled |
| `HrServiceLevelPolicyId` | `int` | FK | — |
| `RelatedEntityType` | `string` | — | — |
| `RelatedEntityPublicReference` | `string` | — | — |
| `FirstRespondedAt` | `datetime` | — | — |
| `ResolvedAt` | `datetime` | — | — |
| `ResolutionCode` | `string` | — | — |
| `ResolutionSummary` | `string` | — | — |
| `ClosedAt` | `datetime` | — | — |
| `CancelledAt` | `datetime` | — | — |
| `CancellationReason` | `string` | — | — |
| `Version` | `int` | — | — |
| `RetentionUntilDate` | `date` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## HrServiceRequestMessage

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `HrServiceRequestId` | `int` | FK | — |
| `AuthorType` | `string` | — | Employee \| Hr \| System |
| `AuthorUserAccountId` | `int` | FK | — |
| `AuthorNameSnapshot` | `string` | — | — |
| `Visibility` | `string` | — | EmployeeVisible \| Internal |
| `MessageType` | `string` | — | Message \| StatusUpdate \| Resolution \| SystemNote |
| `Body` | `string` | — | Sanitized content |
| `ContentDigest` | `string` | — | — |
| `SentAt` | `datetime` | — | — |
| `SupersededAt` | `datetime` | — | — |
| `SupersededByHrServiceRequestMessageId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |

## HrServiceRequestAttachment

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `HrServiceRequestId` | `int` | FK | — |
| `HrServiceRequestMessageId` | `int` | FK | — |
| `DocumentId` | `int` | FK | Documents |
| `Visibility` | `string` | — | EmployeeVisible \| Internal |
| `DisplayName` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## HrServiceRequestAssignment

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | — |
| `HrServiceRequestId` | `int` | FK | — |
| `HrServiceTeamId` | `int` | FK | — |
| `AssigneeUserAccountId` | `int` | FK | — |
| `AssignmentReason` | `string` | — | — |
| `AssignedAt` | `datetime` | — | — |
| `AssignedByUserAccountId` | `int` | FK | — |
| `EndedAt` | `datetime` | — | — |
| `EndReason` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |

## HrServiceLevelTarget

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | — |
| `HrServiceRequestId` | `int` | FK | — |
| `HrServiceLevelPolicyId` | `int` | FK | — |
| `TargetType` | `string` | — | FirstResponse \| NextResponse \| Resolution |
| `SequenceNumber` | `int` | — | — |
| `Status` | `string` | — | Running \| Paused \| Met \| Breached \| Cancelled |
| `StartedAt` | `datetime` | — | — |
| `DueAt` | `datetime` | — | — |
| `PausedAt` | `datetime` | — | — |
| `ConsumedBusinessMinutes` | `int` | — | — |
| `MetAt` | `datetime` | — | — |
| `BreachedAt` | `datetime` | — | — |
| `CorrectionReason` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `UpdatedAt` | `datetime` | — | — |
