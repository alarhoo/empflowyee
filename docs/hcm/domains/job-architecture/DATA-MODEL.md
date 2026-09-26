# Job Architecture — Logical Data Model

These entities define reusable job architecture and planned positions. Compensation money, employee incumbency and authorization are deliberately outside this model.

## JobCatalogue

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `Code` | `string` | UK | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `CurrentPublishedVersionId` | `int` | FK | — |
| `Status` | `string` | — | Active \| Retired |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## JobCatalogueVersion

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobCatalogueId` | `int` | FK | — |
| `VersionNumber` | `int` | — | — |
| `Status` | `string` | — | Draft \| InReview \| Published \| Superseded \| Retired |
| `EffectiveFromDate` | `date` | — | — |
| `EffectiveToDate` | `date` | — | — |
| `SupersedesJobCatalogueVersionId` | `int` | FK | — |
| `ChangeSummary` | `string` | — | — |
| `SourceDigest` | `string` | — | — |
| `PublishedAt` | `datetime` | — | — |
| `PublishedByUserAccountId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## JobFamily

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobCatalogueVersionId` | `int` | FK | — |
| `ParentJobFamilyId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `MaterializedPath` | `string` | — | — |
| `Depth` | `int` | — | — |
| `SortOrder` | `int` | — | — |
| `IsActive` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## CareerTrack

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobCatalogueVersionId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `SortOrder` | `int` | — | — |
| `IsActive` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## JobLevel

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `CareerTrackId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `SequenceNumber` | `int` | — | — |
| `ScopeSummary` | `string` | — | — |
| `IsActive` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## JobBand

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobCatalogueVersionId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `SequenceNumber` | `int` | — | — |
| `IsActive` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## JobGrade

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobBandId` | `int` | FK | — |
| `Code` | `string` | — | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `SequenceNumber` | `int` | — | — |
| `IsActive` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## JobProfile

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `Code` | `string` | UK | — |
| `Name` | `string` | — | — |
| `Status` | `string` | — | Active \| Retired |
| `CurrentPublishedVersionId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## JobProfileVersion

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobProfileId` | `int` | FK | — |
| `JobCatalogueVersionId` | `int` | FK | — |
| `JobFamilyId` | `int` | FK | — |
| `CareerTrackId` | `int` | FK | — |
| `JobLevelId` | `int` | FK | — |
| `VersionNumber` | `int` | — | — |
| `Status` | `string` | — | Draft \| InReview \| Published \| Superseded \| Retired |
| `Summary` | `string` | — | — |
| `Purpose` | `string` | — | — |
| `ScopeOfImpact` | `string` | — | — |
| `AutonomyLevel` | `string` | — | — |
| `EffectiveFromDate` | `date` | — | — |
| `EffectiveToDate` | `date` | — | — |
| `SupersedesJobProfileVersionId` | `int` | FK | — |
| `SourceDigest` | `string` | — | — |
| `PublishedAt` | `datetime` | — | — |
| `PublishedByUserAccountId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## JobProfileResponsibility

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobProfileVersionId` | `int` | FK | — |
| `ResponsibilityCode` | `string` | — | — |
| `Statement` | `string` | — | — |
| `IsEssential` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## JobProfileRequirement

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobProfileVersionId` | `int` | FK | — |
| `RequirementCode` | `string` | — | — |
| `RequirementType` | `string` | — | Education \| Experience \| Certification \| Licence \| Language \| Skill \| Competency \| Other |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `ProficiencyLevel` | `string` | — | — |
| `MinimumQuantity` | `decimal` | — | — |
| `QuantityUnit` | `string` | — | — |
| `ExternalFrameworkCode` | `string` | — | — |
| `ExternalItemReference` | `string` | — | — |
| `IsMandatory` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## JobProfileGrade

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobProfileVersionId` | `int` | FK | — |
| `JobGradeId` | `int` | FK | — |
| `IsDefault` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## Position

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `PositionCode` | `string` | UK | — |
| `PositionName` | `string` | — | — |
| `LifecycleStatus` | `string` | — | Planned \| Open \| Frozen \| Closed \| Cancelled |
| `CurrentPublishedVersionId` | `int` | FK | — |
| `Version` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## PositionVersion

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `PositionId` | `int` | FK | — |
| `JobProfileVersionId` | `int` | FK | — |
| `JobGradeId` | `int` | FK | — |
| `DesignationId` | `int` | FK | — |
| `LegalEntityId` | `int` | FK | — |
| `OrgUnitId` | `int` | FK | — |
| `DepartmentId` | `int` | FK | — |
| `LocationId` | `int` | FK | — |
| `VersionNumber` | `int` | — | — |
| `Status` | `string` | — | Draft \| InReview \| Published \| Superseded \| Cancelled |
| `PositionType` | `string` | — | Regular \| Temporary \| Project |
| `FullTimeEquivalentCapacity` | `decimal` | — | — |
| `HeadcountCapacity` | `int` | — | — |
| `IsKeyPosition` | `boolean` | — | — |
| `CostCenterCode` | `string` | — | — |
| `EffectiveFromDate` | `date` | — | — |
| `EffectiveToDate` | `date` | — | — |
| `SupersedesPositionVersionId` | `int` | FK | — |
| `ChangeSummary` | `string` | — | — |
| `SourceDigest` | `string` | — | — |
| `PublishedAt` | `datetime` | — | — |
| `PublishedByUserAccountId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## PositionRequirement

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `PositionVersionId` | `int` | FK | — |
| `SourceJobProfileRequirementId` | `int` | FK | — |
| `RequirementCode` | `string` | — | — |
| `VarianceType` | `string` | — | Add \| Replace \| Strengthen \| Waive |
| `RequirementType` | `string` | — | Education \| Experience \| Certification \| Licence \| Language \| Skill \| Competency \| Other |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `ProficiencyLevel` | `string` | — | — |
| `MinimumQuantity` | `decimal` | — | — |
| `QuantityUnit` | `string` | — | — |
| `ExternalFrameworkCode` | `string` | — | — |
| `ExternalItemReference` | `string` | — | — |
| `IsMandatory` | `boolean` | — | — |
| `EncryptedJustification` | `string` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## PositionRelationship

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `SourcePositionId` | `int` | FK | — |
| `TargetPositionId` | `int` | FK | — |
| `RelationshipType` | `string` | — | SolidLine \| DottedLine \| Functional |
| `EffectiveFromDate` | `date` | — | — |
| `EffectiveToDate` | `date` | — | — |
| `SourcePositionVersionId` | `int` | FK | — |
| `TargetPositionVersionId` | `int` | FK | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## PositionChangeRequest

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `PositionId` | `int` | FK | — |
| `RequestType` | `string` | — | Create \| Change \| Freeze \| Reopen \| Close \| Cancel |
| `Status` | `string` | — | Draft \| Previewed \| Submitted \| PendingApproval \| Approved \| Rejected \| Withdrawn \| Applying \| Applied \| Failed |
| `BasePositionVersionId` | `int` | FK | — |
| `ProposedPositionVersionId` | `int` | FK | — |
| `EncryptedReason` | `string` | — | — |
| `RequestedByUserAccountId` | `int` | FK | — |
| `RequestedAt` | `datetime` | — | — |
| `AppliedAt` | `datetime` | — | — |
| `Version` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `UpdatedAt` | `datetime` | — | — |

## PositionChangeItem

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `PositionChangeRequestId` | `int` | FK | — |
| `FieldCode` | `string` | — | — |
| `ChangeType` | `string` | — | Set \| Clear \| AddRequirement \| ReplaceRequirement \| RemoveRequirement |
| `OldValueDigest` | `string` | — | — |
| `NewValueDigest` | `string` | — | — |
| `SafeSummary` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |

## PositionApprovalCase

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `PositionChangeRequestId` | `int` | FK | — |
| `SubjectVersion` | `int` | — | — |
| `Status` | `string` | — | Requested \| Pending \| Approved \| Rejected \| Cancelled \| Failed |
| `WorkflowDefinitionCode` | `string` | — | — |
| `WorkflowInstancePublicReference` | `string` | — | — |
| `PolicySnapshotDigest` | `string` | — | — |
| `RequestedAt` | `datetime` | — | — |
| `CompletedAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |

## PositionDecision

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `PositionApprovalCaseId` | `int` | FK | — |
| `WorkflowDecisionEventId` | `string` | UK | — |
| `Decision` | `string` | — | Approved \| Rejected \| Cancelled |
| `SubjectVersion` | `int` | — | — |
| `DecidedByUserAccountId` | `int` | FK | — |
| `EncryptedComment` | `string` | — | — |
| `DecidedAt` | `datetime` | — | — |
| `AppliedAt` | `datetime` | — | — |
| `IdempotencyKey` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |

## PositionImpactPreview

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `PositionChangeRequestId` | `int` | FK | — |
| `PreviewRevision` | `int` | — | — |
| `Status` | `string` | — | Building \| Ready \| Stale \| Failed |
| `ActiveAssignmentCount` | `int` | — | — |
| `AssignedFullTimeEquivalent` | `decimal` | — | — |
| `ChildPositionCount` | `int` | — | — |
| `OpenRecruitmentCount` | `int` | — | — |
| `DownstreamReferenceCount` | `int` | — | — |
| `SourceVersionDigest` | `string` | — | — |
| `SafeSummary` | `string` | — | — |
| `CalculatedAt` | `datetime` | — | — |
| `ExpiresAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |

## JobArchitectureImportBatch

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `SourceDocumentId` | `int` | FK | — |
| `ImportType` | `string` | — | Catalogue \| JobProfiles \| Positions \| PositionRequirements |
| `Status` | `string` | — | Uploaded \| Validating \| Validated \| Applying \| Completed \| CompletedWithErrors \| Failed \| Cancelled |
| `TemplateVersion` | `string` | — | — |
| `SourceDigest` | `string` | — | — |
| `TotalRows` | `int` | — | — |
| `ValidRows` | `int` | — | — |
| `AppliedRows` | `int` | — | — |
| `FailedRows` | `int` | — | — |
| `RequestedByUserAccountId` | `int` | FK | — |
| `RequestedAt` | `datetime` | — | — |
| `CompletedAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |

## JobArchitectureImportRow

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobArchitectureImportBatchId` | `int` | FK | — |
| `RowNumber` | `int` | — | — |
| `RowDigest` | `string` | — | — |
| `Status` | `string` | — | Pending \| Valid \| Invalid \| Applied \| Failed \| Skipped |
| `MatchKey` | `string` | — | — |
| `EntityType` | `string` | — | — |
| `AppliedEntityPublicReference` | `string` | — | — |
| `ProcessedAt` | `datetime` | — | — |
| `CreatedAt` | `datetime` | — | — |

## JobArchitectureImportIssue

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `JobArchitectureImportRowId` | `int` | FK | — |
| `FieldCode` | `string` | — | — |
| `IssueCode` | `string` | — | — |
| `Severity` | `string` | — | Warning \| Error |
| `SafeMessage` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |

## JobArchitectureReconciliationException

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `uuid` | UK | — |
| `TenantId` | `int` | FK | — |
| `OrganizationId` | `int` | FK | — |
| `ExceptionType` | `string` | — | CatalogueDrift \| InvalidHierarchy \| ProfileGradeMismatch \| PositionCapacityMismatch \| OrphanWorkflow \| StalePreview \| ImportMismatch |
| `SubjectType` | `string` | — | — |
| `SubjectPublicId` | `uuid` | — | — |
| `Severity` | `string` | — | Warning \| Error \| Critical |
| `Status` | `string` | — | Open \| Investigating \| Resolved \| Ignored |
| `SafeSummary` | `string` | — | — |
| `EvidenceDigest` | `string` | — | — |
| `DetectedAt` | `datetime` | — | — |
| `LastSeenAt` | `datetime` | — | — |
| `ResolvedAt` | `datetime` | — | — |
| `ResolvedByUserAccountId` | `int` | FK | — |
| `ResolutionCode` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |
