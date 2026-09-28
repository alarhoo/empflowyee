# Leave — Logical Data Model

Current-release applicability: the [approved decisions](../../roadmap/HCM-3-DECISIONS.md#decisions) and [owning technical design](TECHNICAL-DESIGN.md) explicitly exclude future logical entities/transitions for offline/device/geofence capture, auto-close, pooled claim/release, delegation creation, new step-up and encashment payment/handoff. Broader logical state/table catalogues below are not permission to implement those capabilities. Physical identity and exact-duration mappings are specified by the SQL TDD; Unpaid tracking is an explicit exception to account/reservation transitions.

This logical catalogue defines HCM-3 Leave facts. It is not DDL. Claude must reconcile it with current migrations, opaque ID conventions and tenant/RLS patterns before producing SQL-first migrations.

## LeaveType

| Field            | Type       | Constraints | Meaning                                                            |
| ---------------- | ---------- | ----------- | ------------------------------------------------------------------ |
| `Id`             | `int`      | PK          | —                                                                  |
| `PublicId`       | `uuid`     | UK          | —                                                                  |
| `TenantId`       | `int`      | FK          | —                                                                  |
| `OrganizationId` | `int`      | FK          | —                                                                  |
| `Code`           | `string`   | UK          | —                                                                  |
| `Name`           | `string`   | —           | —                                                                  |
| `Description`    | `string`   | —           | —                                                                  |
| `Category`       | `string`   | —           | Annual \| Sick \| Casual \| Parental \| Unpaid \| CompOff \| Other |
| `Unit`           | `string`   | —           | Day \| Hour                                                        |
| `IsPaid`         | `boolean`  | —           | —                                                                  |
| `IsSensitive`    | `boolean`  | —           | —                                                                  |
| `IsActive`       | `boolean`  | —           | —                                                                  |
| `SortOrder`      | `int`      | —           | —                                                                  |
| `CreatedAt`      | `datetime` | —           | —                                                                  |
| `CreatedBy`      | `string`   | —           | —                                                                  |
| `UpdatedAt`      | `datetime` | —           | —                                                                  |
| `UpdatedBy`      | `string`   | —           | —                                                                  |

## LeavePolicy

| Field            | Type       | Constraints | Meaning           |
| ---------------- | ---------- | ----------- | ----------------- |
| `Id`             | `int`      | PK          | —                 |
| `PublicId`       | `uuid`     | UK          | —                 |
| `TenantId`       | `int`      | FK          | —                 |
| `OrganizationId` | `int`      | FK          | —                 |
| `LeaveTypeId`    | `int`      | FK          | —                 |
| `Code`           | `string`   | UK          | —                 |
| `Name`           | `string`   | —           | —                 |
| `Description`    | `string`   | —           | —                 |
| `Status`         | `string`   | —           | Active \| Retired |
| `CreatedAt`      | `datetime` | —           | —                 |
| `CreatedBy`      | `string`   | —           | —                 |
| `UpdatedAt`      | `datetime` | —           | —                 |
| `UpdatedBy`      | `string`   | —           | —                 |

## LeavePolicyVersion

| Field                            | Type       | Constraints | Meaning                                        |
| -------------------------------- | ---------- | ----------- | ---------------------------------------------- |
| `Id`                             | `int`      | PK          | —                                              |
| `PublicId`                       | `uuid`     | UK          | —                                              |
| `TenantId`                       | `int`      | FK          | —                                              |
| `LeavePolicyId`                  | `int`      | FK          | —                                              |
| `VersionNumber`                  | `int`      | —           | —                                              |
| `Status`                         | `string`   | —           | Draft \| Published \| Retired                  |
| `EffectiveFromDate`              | `date`     | —           | —                                              |
| `EffectiveToDate`                | `date`     | —           | —                                              |
| `JurisdictionCode`               | `string`   | —           | —                                              |
| `StatutoryFloorUnits`            | `decimal`  | —           | —                                              |
| `MinimumRequestUnits`            | `decimal`  | —           | —                                              |
| `MaximumRequestUnits`            | `decimal`  | —           | —                                              |
| `MaximumNegativeBalanceUnits`    | `decimal`  | —           | —                                              |
| `AllowHalfDay`                   | `boolean`  | —           | —                                              |
| `AllowHourly`                    | `boolean`  | —           | —                                              |
| `AllowNegativeBalance`           | `boolean`  | —           | —                                              |
| `CountNonWorkingDays`            | `boolean`  | —           | —                                              |
| `ReasonRequired`                 | `boolean`  | —           | —                                              |
| `AttachmentRequired`             | `boolean`  | —           | —                                              |
| `AttachmentThresholdUnits`       | `decimal`  | —           | —                                              |
| `StandardDayHours`               | `decimal`  | —           | —                                              |
| `MinimumRequestIncrementMinutes` | `int`      | —           | —                                              |
| `RequestRoundingMode`            | `string`   | —           | None \| Down \| HalfUp \| Up                   |
| `RequestRoundingIncrement`       | `decimal`  | —           | —                                              |
| `MaximumBackdatedDays`           | `int`      | —           | —                                              |
| `MaximumAdvanceDays`             | `int`      | —           | —                                              |
| `ConsumptionPostingPoint`        | `string`   | —           | OnApproval \| OnLeaveDayStart \| OnLeaveDayEnd |
| `BalanceDisplayMode`             | `string`   | —           | Available \| EarnedAndAvailable \| Hidden      |
| `SupersedesLeavePolicyVersionId` | `int`      | FK          | —                                              |
| `PublishedAt`                    | `datetime` | —           | —                                              |
| `PublishedByUserAccountId`       | `int`      | FK          | —                                              |
| `CreatedAt`                      | `datetime` | —           | —                                              |
| `CreatedBy`                      | `string`   | —           | —                                              |
| `UpdatedAt`                      | `datetime` | —           | —                                              |
| `UpdatedBy`                      | `string`   | —           | —                                              |

## LeaveEligibilityRule

| Field                  | Type       | Constraints | Meaning            |
| ---------------------- | ---------- | ----------- | ------------------ |
| `Id`                   | `int`      | PK          | —                  |
| `TenantId`             | `int`      | FK          | —                  |
| `LeavePolicyVersionId` | `int`      | FK          | —                  |
| `Priority`             | `int`      | —           | —                  |
| `Effect`               | `string`   | —           | Include \| Exclude |
| `LegalEntityId`        | `int`      | FK          | —                  |
| `OrgUnitId`            | `int`      | FK          | —                  |
| `DepartmentId`         | `int`      | FK          | —                  |
| `LocationId`           | `int`      | FK          | —                  |
| `WorkerTypeId`         | `int`      | FK          | —                  |
| `EmploymentType`       | `string`   | —           | —                  |
| `GenderCode`           | `string`   | —           | —                  |
| `MinimumServiceDays`   | `int`      | —           | —                  |
| `EffectiveFromDate`    | `date`     | —           | —                  |
| `EffectiveToDate`      | `date`     | —           | —                  |
| `CreatedAt`            | `datetime` | —           | —                  |
| `CreatedBy`            | `string`   | —           | —                  |

## LeavePolicyAssignment

| Field                  | Type       | Constraints | Meaning            |
| ---------------------- | ---------- | ----------- | ------------------ |
| `Id`                   | `int`      | PK          | —                  |
| `PublicId`             | `uuid`     | UK          | —                  |
| `TenantId`             | `int`      | FK          | —                  |
| `LeavePolicyVersionId` | `int`      | FK          | —                  |
| `EmploymentId`         | `int`      | FK          | —                  |
| `AssignmentMode`       | `string`   | —           | Include \| Exclude |
| `ReasonCode`           | `string`   | —           | —                  |
| `EffectiveFromDate`    | `date`     | —           | —                  |
| `EffectiveToDate`      | `date`     | —           | —                  |
| `CreatedAt`            | `datetime` | —           | —                  |
| `CreatedBy`            | `string`   | —           | —                  |
| `UpdatedAt`            | `datetime` | —           | —                  |
| `UpdatedBy`            | `string`   | —           | —                  |

## LeaveAccrualRule

| Field                        | Type       | Constraints | Meaning                                                        |
| ---------------------------- | ---------- | ----------- | -------------------------------------------------------------- |
| `Id`                         | `int`      | PK          | —                                                              |
| `TenantId`                   | `int`      | FK          | —                                                              |
| `LeavePolicyVersionId`       | `int`      | FK          | —                                                              |
| `SequenceNumber`             | `int`      | —           | —                                                              |
| `Frequency`                  | `string`   | —           | OnJoin \| Monthly \| Quarterly \| Annual \| ServiceAnniversary |
| `Timing`                     | `string`   | —           | Advance \| Arrears                                             |
| `UnitsPerOccurrence`         | `decimal`  | —           | —                                                              |
| `ProrationMethod`            | `string`   | —           | None \| CalendarDays \| WorkingDays                            |
| `WaitingPeriodDays`          | `int`      | —           | —                                                              |
| `MaximumAccruedBalanceUnits` | `decimal`  | —           | —                                                              |
| `RoundingMode`               | `string`   | —           | None \| Down \| HalfUp \| Up                                   |
| `RoundingIncrement`          | `decimal`  | —           | —                                                              |
| `EffectiveFromDate`          | `date`     | —           | —                                                              |
| `EffectiveToDate`            | `date`     | —           | —                                                              |
| `CreatedAt`                  | `datetime` | —           | —                                                              |
| `CreatedBy`                  | `string`   | —           | —                                                              |

## LeaveCarryForwardRule

| Field                      | Type       | Constraints | Meaning                               |
| -------------------------- | ---------- | ----------- | ------------------------------------- |
| `Id`                       | `int`      | PK          | —                                     |
| `TenantId`                 | `int`      | FK          | —                                     |
| `LeavePolicyVersionId`     | `int`      | FK          | —                                     |
| `MaximumCarryForwardUnits` | `decimal`  | —           | —                                     |
| `ExpiryAfterDays`          | `int`      | —           | —                                     |
| `ExpiryBasis`              | `string`   | —           | PeriodStart \| PeriodEnd \| GrantDate |
| `CarryNegativeBalance`     | `boolean`  | —           | —                                     |
| `CreatedAt`                | `datetime` | —           | —                                     |
| `CreatedBy`                | `string`   | —           | —                                     |

## LeaveCompOffRule

| Field                         | Type       | Constraints | Meaning                                            |
| ----------------------------- | ---------- | ----------- | -------------------------------------------------- |
| `Id`                          | `int`      | PK          | —                                                  |
| `TenantId`                    | `int`      | FK          | —                                                  |
| `LeavePolicyVersionId`        | `int`      | FK          | —                                                  |
| `QualifyingBasis`             | `string`   | —           | HolidayWork \| WeeklyOffWork \| ApprovedExtraHours |
| `MinimumQualifyingMinutes`    | `int`      | —           | —                                                  |
| `HalfUnitQualifyingMinutes`   | `int`      | —           | —                                                  |
| `FullUnitQualifyingMinutes`   | `int`      | —           | —                                                  |
| `MaximumUnitsPerWorkDate`     | `decimal`  | —           | —                                                  |
| `MaximumEarnedUnitsPerPeriod` | `decimal`  | —           | —                                                  |
| `RequiresEmployeeClaim`       | `boolean`  | —           | —                                                  |
| `ClaimWindowDays`             | `int`      | —           | —                                                  |
| `ExpiryAfterDays`             | `int`      | —           | —                                                  |
| `ExpiryBasis`                 | `string`   | —           | WorkDate \| CreditDate \| PeriodEnd                |
| `AllowsPartialUse`            | `boolean`  | —           | —                                                  |
| `EffectiveFromDate`           | `date`     | —           | —                                                  |
| `EffectiveToDate`             | `date`     | —           | —                                                  |
| `CreatedAt`                   | `datetime` | —           | —                                                  |
| `CreatedBy`                   | `string`   | —           | —                                                  |

## LeaveEncashmentRule

| Field                         | Type       | Constraints | Meaning                                  |
| ----------------------------- | ---------- | ----------- | ---------------------------------------- |
| `Id`                          | `int`      | PK          | —                                        |
| `TenantId`                    | `int`      | FK          | —                                        |
| `LeavePolicyVersionId`        | `int`      | FK          | —                                        |
| `MinimumRequestUnits`         | `decimal`  | —           | —                                        |
| `MaximumRequestUnits`         | `decimal`  | —           | —                                        |
| `MinimumRetainedBalanceUnits` | `decimal`  | —           | —                                        |
| `MaximumUnitsPerPeriod`       | `decimal`  | —           | —                                        |
| `MaximumRequestsPerPeriod`    | `int`      | —           | —                                        |
| `MinimumServiceDays`          | `int`      | —           | —                                        |
| `EligibilityWindow`           | `string`   | —           | Anytime \| PeriodClose \| SeparationOnly |
| `TargetSystem`                | `string`   | —           | Payroll \| Finance                       |
| `RequiresPayrollHandoff`      | `boolean`  | —           | —                                        |
| `CreatedAt`                   | `datetime` | —           | —                                        |
| `CreatedBy`                   | `string`   | —           | —                                        |

## LeaveRestrictionRule

| Field                    | Type       | Constraints | Meaning                                                       |
| ------------------------ | ---------- | ----------- | ------------------------------------------------------------- |
| `Id`                     | `int`      | PK          | —                                                             |
| `TenantId`               | `int`      | FK          | —                                                             |
| `LeavePolicyVersionId`   | `int`      | FK          | —                                                             |
| `Priority`               | `int`      | —           | —                                                             |
| `RuleType`               | `string`   | —           | Notice \| ConsecutiveLimit \| Blackout \| Bridge \| Frequency |
| `Effect`                 | `string`   | —           | Deny \| Warn \| RequireApproval \| RequireAttachment          |
| `MinimumNoticeDays`      | `int`      | —           | —                                                             |
| `MaximumConsecutiveDays` | `int`      | —           | —                                                             |
| `WindowStartDate`        | `date`     | —           | —                                                             |
| `WindowEndDate`          | `date`     | —           | —                                                             |
| `ParametersJson`         | `string`   | —           | —                                                             |
| `CreatedAt`              | `datetime` | —           | —                                                             |
| `CreatedBy`              | `string`   | —           | —                                                             |

## LeaveApprovalRule

| Field                            | Type       | Constraints | Meaning                                                      |
| -------------------------------- | ---------- | ----------- | ------------------------------------------------------------ |
| `Id`                             | `int`      | PK          | —                                                            |
| `TenantId`                       | `int`      | FK          | —                                                            |
| `LeavePolicyVersionId`           | `int`      | FK          | —                                                            |
| `SubjectType`                    | `string`   | —           | Leave \| Cancellation \| CompOff \| Encashment \| Adjustment |
| `StageNumber`                    | `int`      | —           | —                                                            |
| `ApprovalSlotCode`               | `string`   | —           | —                                                            |
| `ApproverSource`                 | `string`   | —           | LineManager \| ManagerLevel \| Function \| NamedUser         |
| `ManagerLevel`                   | `int`      | —           | —                                                            |
| `ApproverFunctionCode`           | `string`   | —           | —                                                            |
| `ApproverUserAccountId`          | `int`      | FK          | —                                                            |
| `ThresholdFromUnits`             | `decimal`  | —           | —                                                            |
| `ThresholdToUnits`               | `decimal`  | —           | —                                                            |
| `IsRequired`                     | `boolean`  | —           | —                                                            |
| `AllowDelegatedDecision`         | `boolean`  | —           | —                                                            |
| `ReminderAfterHours`             | `int`      | —           | —                                                            |
| `EscalationAfterHours`           | `int`      | —           | —                                                            |
| `EscalationApproverSource`       | `string`   | —           | None \| ManagerLevel \| Function                             |
| `EscalationApproverFunctionCode` | `string`   | —           | —                                                            |
| `CreatedAt`                      | `datetime` | —           | —                                                            |
| `CreatedBy`                      | `string`   | —           | —                                                            |

## LeavePolicyImpactPreview

| Field                      | Type       | Constraints | Meaning                                           |
| -------------------------- | ---------- | ----------- | ------------------------------------------------- |
| `Id`                       | `int`      | PK          | —                                                 |
| `PublicId`                 | `uuid`     | UK          | —                                                 |
| `TenantId`                 | `int`      | FK          | —                                                 |
| `LeavePolicyVersionId`     | `int`      | FK          | —                                                 |
| `Status`                   | `string`   | —           | Running \| Ready \| Failed \| Expired \| Consumed |
| `SourceWorkforceVersion`   | `string`   | —           | —                                                 |
| `SourceCalendarVersion`    | `string`   | —           | —                                                 |
| `EvaluatedEmploymentCount` | `int`      | —           | —                                                 |
| `EnrollmentAddCount`       | `int`      | —           | —                                                 |
| `EnrollmentEndCount`       | `int`      | —           | —                                                 |
| `EnrollmentChangeCount`    | `int`      | —           | —                                                 |
| `OpenRequestImpactCount`   | `int`      | —           | —                                                 |
| `ImpactDigest`             | `string`   | —           | —                                                 |
| `RequestedAt`              | `datetime` | —           | —                                                 |
| `RequestedByUserAccountId` | `int`      | FK          | —                                                 |
| `CompletedAt`              | `datetime` | —           | —                                                 |
| `ExpiresAt`                | `datetime` | —           | —                                                 |
| `FailureCode`              | `string`   | —           | —                                                 |
| `CreatedAt`                | `datetime` | —           | —                                                 |
| `UpdatedAt`                | `datetime` | —           | —                                                 |

## LeavePeriod

| Field                   | Type       | Constraints | Meaning                              |
| ----------------------- | ---------- | ----------- | ------------------------------------ |
| `Id`                    | `int`      | PK          | —                                    |
| `PublicId`              | `uuid`     | UK          | —                                    |
| `TenantId`              | `int`      | FK          | —                                    |
| `OrganizationId`        | `int`      | FK          | —                                    |
| `Code`                  | `string`   | UK          | —                                    |
| `Name`                  | `string`   | —           | —                                    |
| `StartDate`             | `date`     | —           | —                                    |
| `EndDate`               | `date`     | —           | —                                    |
| `Status`                | `string`   | —           | Planned \| Open \| Closing \| Closed |
| `ClosedAt`              | `datetime` | —           | —                                    |
| `ClosedByUserAccountId` | `int`      | FK          | —                                    |
| `CreatedAt`             | `datetime` | —           | —                                    |
| `CreatedBy`             | `string`   | —           | —                                    |
| `UpdatedAt`             | `datetime` | —           | —                                    |
| `UpdatedBy`             | `string`   | —           | —                                    |

## WorkerLeaveEnrollment

| Field                          | Type       | Constraints | Meaning                                    |
| ------------------------------ | ---------- | ----------- | ------------------------------------------ |
| `Id`                           | `int`      | PK          | —                                          |
| `PublicId`                     | `uuid`     | UK          | —                                          |
| `TenantId`                     | `int`      | FK          | —                                          |
| `EmploymentId`                 | `int`      | FK          | —                                          |
| `LeavePolicyVersionId`         | `int`      | FK          | —                                          |
| `LeavePeriodId`                | `int`      | FK          | —                                          |
| `Source`                       | `string`   | —           | Eligibility \| ManualOverride \| Migration |
| `Status`                       | `string`   | —           | Pending \| Active \| Suspended \| Ended    |
| `EligibleFromDate`             | `date`     | —           | —                                          |
| `EligibleToDate`               | `date`     | —           | —                                          |
| `EligibilitySnapshotEncrypted` | `string`   | —           | —                                          |
| `Version`                      | `int`      | —           | —                                          |
| `CreatedAt`                    | `datetime` | —           | —                                          |
| `CreatedBy`                    | `string`   | —           | —                                          |
| `UpdatedAt`                    | `datetime` | —           | —                                          |
| `UpdatedBy`                    | `string`   | —           | —                                          |

## LeaveEntitlementGrant

| Field                     | Type       | Constraints | Meaning                                                             |
| ------------------------- | ---------- | ----------- | ------------------------------------------------------------------- |
| `Id`                      | `int`      | PK          | —                                                                   |
| `PublicId`                | `uuid`     | UK          | —                                                                   |
| `TenantId`                | `int`      | FK          | —                                                                   |
| `WorkerLeaveEnrollmentId` | `int`      | FK          | —                                                                   |
| `GrantType`               | `string`   | —           | Opening \| Annual \| Prorated \| CarryForward \| Statutory \| Event |
| `GrantedUnits`            | `decimal`  | —           | —                                                                   |
| `GrantDate`               | `date`     | —           | —                                                                   |
| `ExpiresOnDate`           | `date`     | —           | —                                                                   |
| `SourceReference`         | `string`   | —           | —                                                                   |
| `IdempotencyKey`          | `string`   | —           | —                                                                   |
| `CreatedAt`               | `datetime` | —           | —                                                                   |
| `CreatedBy`               | `string`   | —           | —                                                                   |

## LeaveBalanceAccount

| Field                     | Type       | Constraints | Meaning     |
| ------------------------- | ---------- | ----------- | ----------- |
| `Id`                      | `int`      | PK          | —           |
| `PublicId`                | `uuid`     | UK          | —           |
| `TenantId`                | `int`      | FK          | —           |
| `WorkerLeaveEnrollmentId` | `int`      | FK          | —           |
| `Unit`                    | `string`   | —           | Day \| Hour |
| `PostedBalanceUnits`      | `decimal`  | —           | —           |
| `ReservedUnits`           | `decimal`  | —           | —           |
| `AvailableBalanceUnits`   | `decimal`  | —           | —           |
| `LastPostedAt`            | `datetime` | —           | —           |
| `Version`                 | `int`      | —           | —           |
| `CreatedAt`               | `datetime` | —           | —           |
| `UpdatedAt`               | `datetime` | —           | —           |

## LeaveBalanceTransaction

| Field                               | Type       | Constraints | Meaning                                                                                                                |
| ----------------------------------- | ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Id`                                | `int`      | PK          | —                                                                                                                      |
| `PublicId`                          | `uuid`     | UK          | —                                                                                                                      |
| `TenantId`                          | `int`      | FK          | —                                                                                                                      |
| `LeaveBalanceAccountId`             | `int`      | FK          | —                                                                                                                      |
| `SequenceNumber`                    | `int`      | —           | —                                                                                                                      |
| `TransactionType`                   | `string`   | —           | Grant \| Accrual \| CarryForward \| Expiry \| Leave \| Cancellation \| CompOff \| Encashment \| Adjustment \| Reversal |
| `UnitsDelta`                        | `decimal`  | —           | —                                                                                                                      |
| `BalanceAfterUnits`                 | `decimal`  | —           | —                                                                                                                      |
| `EffectiveDate`                     | `date`     | —           | —                                                                                                                      |
| `LeaveEntitlementGrantId`           | `int`      | FK          | —                                                                                                                      |
| `LeaveAccrualRunItemId`             | `int`      | FK          | —                                                                                                                      |
| `LeaveRequestDayId`                 | `int`      | FK          | —                                                                                                                      |
| `CompOffEarningId`                  | `int`      | FK          | —                                                                                                                      |
| `LeaveEncashmentRequestId`          | `int`      | FK          | —                                                                                                                      |
| `LeaveBalanceAdjustmentRequestId`   | `int`      | FK          | —                                                                                                                      |
| `ReversesLeaveBalanceTransactionId` | `int`      | FK          | —                                                                                                                      |
| `IdempotencyKey`                    | `string`   | —           | —                                                                                                                      |
| `ReasonCode`                        | `string`   | —           | —                                                                                                                      |
| `PostedAt`                          | `datetime` | —           | —                                                                                                                      |
| `PostedByUserAccountId`             | `int`      | FK          | —                                                                                                                      |
| `CreatedAt`                         | `datetime` | —           | —                                                                                                                      |

## LeaveBalanceReservation

| Field                      | Type       | Constraints | Meaning                                   |
| -------------------------- | ---------- | ----------- | ----------------------------------------- |
| `Id`                       | `int`      | PK          | —                                         |
| `PublicId`                 | `uuid`     | UK          | —                                         |
| `TenantId`                 | `int`      | FK          | —                                         |
| `LeaveBalanceAccountId`    | `int`      | FK          | —                                         |
| `LeaveRequestId`           | `int`      | FK          | —                                         |
| `LeaveEncashmentRequestId` | `int`      | FK          | —                                         |
| `ReservedUnits`            | `decimal`  | —           | —                                         |
| `Status`                   | `string`   | —           | Active \| Consumed \| Released \| Expired |
| `ExpiresAt`                | `datetime` | —           | —                                         |
| `ConsumedAt`               | `datetime` | —           | —                                         |
| `ReleasedAt`               | `datetime` | —           | —                                         |
| `ExpiredAt`                | `datetime` | —           | —                                         |
| `ReleaseReason`            | `string`   | —           | —                                         |
| `CreatedAt`                | `datetime` | —           | —                                         |
| `UpdatedAt`                | `datetime` | —           | —                                         |

## LeaveBalanceAllocation

| Field                             | Type       | Constraints | Meaning |
| --------------------------------- | ---------- | ----------- | ------- |
| `Id`                              | `int`      | PK          | —       |
| `PublicId`                        | `uuid`     | UK          | —       |
| `TenantId`                        | `int`      | FK          | —       |
| `LeaveBalanceAccountId`           | `int`      | FK          | —       |
| `DebitLeaveBalanceTransactionId`  | `int`      | FK          | —       |
| `CreditLeaveBalanceTransactionId` | `int`      | FK          | —       |
| `AllocatedUnits`                  | `decimal`  | —           | —       |
| `AllocationOrder`                 | `int`      | —           | —       |
| `CreatedAt`                       | `datetime` | —           | —       |

## LeaveAccrualRun

| Field                    | Type       | Constraints | Meaning                                                                       |
| ------------------------ | ---------- | ----------- | ----------------------------------------------------------------------------- |
| `Id`                     | `int`      | PK          | —                                                                             |
| `PublicId`               | `uuid`     | UK          | —                                                                             |
| `TenantId`               | `int`      | FK          | —                                                                             |
| `OrganizationId`         | `int`      | FK          | —                                                                             |
| `LeavePeriodId`          | `int`      | FK          | —                                                                             |
| `AccrualDate`            | `date`     | —           | —                                                                             |
| `RunType`                | `string`   | —           | Scheduled \| Recalculation \| Migration                                       |
| `Status`                 | `string`   | —           | Planned \| Running \| Completed \| CompletedWithErrors \| Failed \| Cancelled |
| `IdempotencyKey`         | `string`   | —           | —                                                                             |
| `TotalItemCount`         | `int`      | —           | —                                                                             |
| `SucceededItemCount`     | `int`      | —           | —                                                                             |
| `FailedItemCount`        | `int`      | —           | —                                                                             |
| `StartedAt`              | `datetime` | —           | —                                                                             |
| `CompletedAt`            | `datetime` | —           | —                                                                             |
| `FailureCode`            | `string`   | —           | —                                                                             |
| `CreatedAt`              | `datetime` | —           | —                                                                             |
| `CreatedByUserAccountId` | `int`      | FK          | —                                                                             |
| `UpdatedAt`              | `datetime` | —           | —                                                                             |

## LeaveAccrualRunItem

| Field                          | Type       | Constraints | Meaning                                              |
| ------------------------------ | ---------- | ----------- | ---------------------------------------------------- |
| `Id`                           | `int`      | PK          | —                                                    |
| `PublicId`                     | `uuid`     | UK          | —                                                    |
| `TenantId`                     | `int`      | FK          | —                                                    |
| `LeaveAccrualRunId`            | `int`      | FK          | —                                                    |
| `WorkerLeaveEnrollmentId`      | `int`      | FK          | —                                                    |
| `LeaveAccrualRuleId`           | `int`      | FK          | —                                                    |
| `Status`                       | `string`   | —           | Pending \| Processing \| Posted \| Skipped \| Failed |
| `CalculatedUnits`              | `decimal`  | —           | —                                                    |
| `PostedUnits`                  | `decimal`  | —           | —                                                    |
| `CalculationSnapshotEncrypted` | `string`   | —           | —                                                    |
| `IdempotencyKey`               | `string`   | —           | —                                                    |
| `FailureCode`                  | `string`   | —           | —                                                    |
| `ProcessedAt`                  | `datetime` | —           | —                                                    |
| `CreatedAt`                    | `datetime` | —           | —                                                    |
| `UpdatedAt`                    | `datetime` | —           | —                                                    |

## LeaveRequest

| Field                            | Type       | Constraints | Meaning                                                                                                                             |
| -------------------------------- | ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Id`                             | `int`      | PK          | —                                                                                                                                   |
| `PublicId`                       | `uuid`     | UK          | —                                                                                                                                   |
| `TenantId`                       | `int`      | FK          | —                                                                                                                                   |
| `RequestNumber`                  | `string`   | UK          | —                                                                                                                                   |
| `WorkerLeaveEnrollmentId`        | `int`      | FK          | —                                                                                                                                   |
| `EmploymentId`                   | `int`      | FK          | —                                                                                                                                   |
| `AssignmentId`                   | `int`      | FK          | —                                                                                                                                   |
| `StartDate`                      | `date`     | —           | —                                                                                                                                   |
| `EndDate`                        | `date`     | —           | —                                                                                                                                   |
| `RequestedUnits`                 | `decimal`  | —           | —                                                                                                                                   |
| `CalculatedUnits`                | `decimal`  | —           | —                                                                                                                                   |
| `EncryptedReason`                | `string`   | —           | —                                                                                                                                   |
| `Status`                         | `string`   | —           | Draft \| Submitted \| PendingApproval \| Approved \| Rejected \| Withdrawn \| CancelPending \| Cancelled \| InProgress \| Completed |
| `ScheduleSnapshotVersion`        | `string`   | —           | —                                                                                                                                   |
| `HolidayCalendarSnapshotVersion` | `string`   | —           | —                                                                                                                                   |
| `CalculationDigest`              | `string`   | —           | —                                                                                                                                   |
| `IdempotencyKey`                 | `string`   | —           | —                                                                                                                                   |
| `Version`                        | `int`      | —           | —                                                                                                                                   |
| `SubmittedAt`                    | `datetime` | —           | —                                                                                                                                   |
| `DecidedAt`                      | `datetime` | —           | —                                                                                                                                   |
| `ApprovedAt`                     | `datetime` | —           | —                                                                                                                                   |
| `RejectedAt`                     | `datetime` | —           | —                                                                                                                                   |
| `WithdrawnAt`                    | `datetime` | —           | —                                                                                                                                   |
| `CancelledAt`                    | `datetime` | —           | —                                                                                                                                   |
| `CreatedAt`                      | `datetime` | —           | —                                                                                                                                   |
| `CreatedByUserAccountId`         | `int`      | FK          | —                                                                                                                                   |
| `UpdatedAt`                      | `datetime` | —           | —                                                                                                                                   |

## LeaveRequestDay

| Field               | Type       | Constraints | Meaning                                     |
| ------------------- | ---------- | ----------- | ------------------------------------------- |
| `Id`                | `int`      | PK          | —                                           |
| `PublicId`          | `uuid`     | UK          | —                                           |
| `TenantId`          | `int`      | FK          | —                                           |
| `LeaveRequestId`    | `int`      | FK          | —                                           |
| `LeaveDate`         | `date`     | —           | —                                           |
| `Portion`           | `string`   | —           | FullDay \| FirstHalf \| SecondHalf \| Hours |
| `StartLocalTime`    | `time`     | —           | —                                           |
| `EndLocalTime`      | `time`     | —           | —                                           |
| `ScheduledMinutes`  | `int`      | —           | —                                           |
| `HolidayMinutes`    | `int`      | —           | —                                           |
| `RequestedMinutes`  | `int`      | —           | —                                           |
| `RequestedUnits`    | `decimal`  | —           | —                                           |
| `TimeZone`          | `string`   | —           | —                                           |
| `CalculationReason` | `string`   | —           | —                                           |
| `Status`            | `string`   | —           | Planned \| Reserved \| Posted \| Cancelled  |
| `CreatedAt`         | `datetime` | —           | —                                           |
| `UpdatedAt`         | `datetime` | —           | —                                           |

## LeaveRequestAttachment

| Field                    | Type       | Constraints | Meaning                             |
| ------------------------ | ---------- | ----------- | ----------------------------------- |
| `Id`                     | `int`      | PK          | —                                   |
| `PublicId`               | `uuid`     | UK          | —                                   |
| `TenantId`               | `int`      | FK          | —                                   |
| `LeaveRequestId`         | `int`      | FK          | —                                   |
| `DocumentId`             | `int`      | FK          | —                                   |
| `AttachmentType`         | `string`   | —           | Evidence \| Medical \| Other        |
| `Visibility`             | `string`   | —           | EmployeeAndApprover \| RestrictedHr |
| `RetentionClassCode`     | `string`   | —           | —                                   |
| `DisposedAt`             | `datetime` | —           | —                                   |
| `CreatedAt`              | `datetime` | —           | —                                   |
| `CreatedByUserAccountId` | `int`      | FK          | —                                   |

## LeaveRequestComment

| Field                 | Type       | Constraints | Meaning                         |
| --------------------- | ---------- | ----------- | ------------------------------- |
| `Id`                  | `int`      | PK          | —                               |
| `PublicId`            | `uuid`     | UK          | —                               |
| `TenantId`            | `int`      | FK          | —                               |
| `LeaveRequestId`      | `int`      | FK          | —                               |
| `AuthorUserAccountId` | `int`      | FK          | —                               |
| `Visibility`          | `string`   | —           | EmployeeAndApprover \| Internal |
| `EncryptedBody`       | `string`   | —           | —                               |
| `CreatedAt`           | `datetime` | —           | —                               |

## LeaveCancellationRequest

| Field                        | Type       | Constraints | Meaning                                                                                         |
| ---------------------------- | ---------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `Id`                         | `int`      | PK          | —                                                                                               |
| `PublicId`                   | `uuid`     | UK          | —                                                                                               |
| `TenantId`                   | `int`      | FK          | —                                                                                               |
| `LeaveRequestId`             | `int`      | FK          | —                                                                                               |
| `CancelFromDate`             | `date`     | —           | —                                                                                               |
| `CancelToDate`               | `date`     | —           | —                                                                                               |
| `RequestedCancellationUnits` | `decimal`  | —           | —                                                                                               |
| `EncryptedReason`            | `string`   | —           | —                                                                                               |
| `Status`                     | `string`   | —           | Draft \| Submitted \| PendingApproval \| Approved \| Rejected \| Withdrawn \| Applied \| Failed |
| `IdempotencyKey`             | `string`   | —           | —                                                                                               |
| `Version`                    | `int`      | —           | —                                                                                               |
| `SubmittedAt`                | `datetime` | —           | —                                                                                               |
| `DecidedAt`                  | `datetime` | —           | —                                                                                               |
| `AppliedAt`                  | `datetime` | —           | —                                                                                               |
| `FailureCode`                | `string`   | —           | —                                                                                               |
| `CreatedAt`                  | `datetime` | —           | —                                                                                               |
| `CreatedByUserAccountId`     | `int`      | FK          | —                                                                                               |
| `UpdatedAt`                  | `datetime` | —           | —                                                                                               |

## CompOffEarning

| Field                     | Type       | Constraints | Meaning                                                                                                     |
| ------------------------- | ---------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `Id`                      | `int`      | PK          | —                                                                                                           |
| `PublicId`                | `uuid`     | UK          | —                                                                                                           |
| `TenantId`                | `int`      | FK          | —                                                                                                           |
| `WorkerLeaveEnrollmentId` | `int`      | FK          | —                                                                                                           |
| `EmploymentId`            | `int`      | FK          | —                                                                                                           |
| `WorkDate`                | `date`     | —           | —                                                                                                           |
| `EarnedMinutes`           | `int`      | —           | —                                                                                                           |
| `EarnedUnits`             | `decimal`  | —           | —                                                                                                           |
| `EvidenceSource`          | `string`   | —           | Attendance \| Timesheet \| Manual                                                                           |
| `EvidencePublicReference` | `string`   | —           | —                                                                                                           |
| `Status`                  | `string`   | —           | PendingClaim \| PendingValidation \| Available \| PartlyUsed \| Consumed \| Expired \| Rejected \| Reversed |
| `ExpiresOnDate`           | `date`     | —           | —                                                                                                           |
| `RemainingUnits`          | `decimal`  | —           | —                                                                                                           |
| `IdempotencyKey`          | `string`   | —           | —                                                                                                           |
| `CreatedAt`               | `datetime` | —           | —                                                                                                           |
| `UpdatedAt`               | `datetime` | —           | —                                                                                                           |

## CompOffCreditRequest

| Field                    | Type       | Constraints | Meaning                                                                                        |
| ------------------------ | ---------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `Id`                     | `int`      | PK          | —                                                                                              |
| `PublicId`               | `uuid`     | UK          | —                                                                                              |
| `TenantId`               | `int`      | FK          | —                                                                                              |
| `CompOffEarningId`       | `int`      | FK          | —                                                                                              |
| `RequestedUnits`         | `decimal`  | —           | —                                                                                              |
| `EncryptedReason`        | `string`   | —           | —                                                                                              |
| `Status`                 | `string`   | —           | Draft \| Submitted \| PendingApproval \| Approved \| Rejected \| Withdrawn \| Posted \| Failed |
| `IdempotencyKey`         | `string`   | —           | —                                                                                              |
| `Version`                | `int`      | —           | —                                                                                              |
| `SubmittedAt`            | `datetime` | —           | —                                                                                              |
| `DecidedAt`              | `datetime` | —           | —                                                                                              |
| `PostedAt`               | `datetime` | —           | —                                                                                              |
| `FailureCode`            | `string`   | —           | —                                                                                              |
| `CreatedAt`              | `datetime` | —           | —                                                                                              |
| `CreatedByUserAccountId` | `int`      | FK          | —                                                                                              |
| `UpdatedAt`              | `datetime` | —           | —                                                                                              |

## LeaveEncashmentRequest

| Field                     | Type       | Constraints | Meaning                                                                                                                                 |
| ------------------------- | ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Id`                      | `int`      | PK          | —                                                                                                                                       |
| `PublicId`                | `uuid`     | UK          | —                                                                                                                                       |
| `TenantId`                | `int`      | FK          | —                                                                                                                                       |
| `WorkerLeaveEnrollmentId` | `int`      | FK          | —                                                                                                                                       |
| `LeaveBalanceAccountId`   | `int`      | FK          | —                                                                                                                                       |
| `RequestedUnits`          | `decimal`  | —           | —                                                                                                                                       |
| `ApprovedUnits`           | `decimal`  | —           | —                                                                                                                                       |
| `EncryptedReason`         | `string`   | —           | —                                                                                                                                       |
| `Status`                  | `string`   | —           | Draft \| Submitted \| PendingApproval \| Approved \| Rejected \| Withdrawn \| HandoffPending \| Accepted \| Paid \| Failed \| Cancelled |
| `IdempotencyKey`          | `string`   | —           | —                                                                                                                                       |
| `Version`                 | `int`      | —           | —                                                                                                                                       |
| `SubmittedAt`             | `datetime` | —           | —                                                                                                                                       |
| `DecidedAt`               | `datetime` | —           | —                                                                                                                                       |
| `AcceptedAt`              | `datetime` | —           | —                                                                                                                                       |
| `PaidAt`                  | `datetime` | —           | —                                                                                                                                       |
| `FailureCode`             | `string`   | —           | —                                                                                                                                       |
| `CreatedAt`               | `datetime` | —           | —                                                                                                                                       |
| `CreatedByUserAccountId`  | `int`      | FK          | —                                                                                                                                       |
| `UpdatedAt`               | `datetime` | —           | —                                                                                                                                       |

## LeaveEncashmentHandoff

| Field                      | Type       | Constraints | Meaning                                                   |
| -------------------------- | ---------- | ----------- | --------------------------------------------------------- |
| `Id`                       | `int`      | PK          | —                                                         |
| `PublicId`                 | `uuid`     | UK          | —                                                         |
| `TenantId`                 | `int`      | FK          | —                                                         |
| `LeaveEncashmentRequestId` | `int`      | FK          | —                                                         |
| `TargetSystem`             | `string`   | —           | Payroll \| Finance                                        |
| `Status`                   | `string`   | —           | Pending \| Sent \| Accepted \| Rejected \| Paid \| Failed |
| `ExternalReference`        | `string`   | —           | —                                                         |
| `IdempotencyKey`           | `string`   | —           | —                                                         |
| `AttemptCount`             | `int`      | —           | —                                                         |
| `SentAt`                   | `datetime` | —           | —                                                         |
| `AcknowledgedAt`           | `datetime` | —           | —                                                         |
| `PaidAt`                   | `datetime` | —           | —                                                         |
| `FailureCode`              | `string`   | —           | —                                                         |
| `CreatedAt`                | `datetime` | —           | —                                                         |
| `UpdatedAt`                | `datetime` | —           | —                                                         |

## LeaveBalanceAdjustmentRequest

| Field                    | Type       | Constraints | Meaning                                                                                        |
| ------------------------ | ---------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `Id`                     | `int`      | PK          | —                                                                                              |
| `PublicId`               | `uuid`     | UK          | —                                                                                              |
| `TenantId`               | `int`      | FK          | —                                                                                              |
| `LeaveBalanceAccountId`  | `int`      | FK          | —                                                                                              |
| `UnitsDelta`             | `decimal`  | —           | —                                                                                              |
| `EffectiveDate`          | `date`     | —           | —                                                                                              |
| `ReasonCode`             | `string`   | —           | —                                                                                              |
| `EncryptedReasonDetail`  | `string`   | —           | —                                                                                              |
| `EvidenceDocumentId`     | `int`      | FK          | —                                                                                              |
| `Status`                 | `string`   | —           | Draft \| Submitted \| PendingApproval \| Approved \| Rejected \| Withdrawn \| Posted \| Failed |
| `IdempotencyKey`         | `string`   | —           | —                                                                                              |
| `Version`                | `int`      | —           | —                                                                                              |
| `SubmittedAt`            | `datetime` | —           | —                                                                                              |
| `DecidedAt`              | `datetime` | —           | —                                                                                              |
| `PostedAt`               | `datetime` | —           | —                                                                                              |
| `FailureCode`            | `string`   | —           | —                                                                                              |
| `CreatedAt`              | `datetime` | —           | —                                                                                              |
| `CreatedByUserAccountId` | `int`      | FK          | —                                                                                              |
| `UpdatedAt`              | `datetime` | —           | —                                                                                              |

## LeaveApprovalCase

| Field                             | Type       | Constraints | Meaning                                                      |
| --------------------------------- | ---------- | ----------- | ------------------------------------------------------------ |
| `Id`                              | `int`      | PK          | —                                                            |
| `PublicId`                        | `uuid`     | UK          | —                                                            |
| `TenantId`                        | `int`      | FK          | —                                                            |
| `LeaveRequestId`                  | `int`      | FK          | —                                                            |
| `LeaveCancellationRequestId`      | `int`      | FK          | —                                                            |
| `CompOffCreditRequestId`          | `int`      | FK          | —                                                            |
| `LeaveEncashmentRequestId`        | `int`      | FK          | —                                                            |
| `LeaveBalanceAdjustmentRequestId` | `int`      | FK          | —                                                            |
| `LeavePolicyVersionId`            | `int`      | FK          | —                                                            |
| `SubjectType`                     | `string`   | —           | Leave \| Cancellation \| CompOff \| Encashment \| Adjustment |
| `Status`                          | `string`   | —           | Pending \| Approved \| Rejected \| Cancelled \| Invalidated  |
| `CurrentStageNumber`              | `int`      | —           | —                                                            |
| `SubjectVersionAtOpen`            | `int`      | —           | —                                                            |
| `RoutingSnapshotEncrypted`        | `string`   | —           | —                                                            |
| `OpenedAt`                        | `datetime` | —           | —                                                            |
| `DecidedAt`                       | `datetime` | —           | —                                                            |
| `InvalidatedAt`                   | `datetime` | —           | —                                                            |
| `InvalidationReason`              | `string`   | —           | —                                                            |
| `WorkflowPublicReference`         | `string`   | —           | —                                                            |
| `Version`                         | `int`      | —           | —                                                            |
| `CreatedAt`                       | `datetime` | —           | —                                                            |
| `UpdatedAt`                       | `datetime` | —           | —                                                            |

## LeaveDecision

| Field                    | Type       | Constraints | Meaning              |
| ------------------------ | ---------- | ----------- | -------------------- |
| `Id`                     | `int`      | PK          | —                    |
| `PublicId`               | `uuid`     | UK          | —                    |
| `TenantId`               | `int`      | FK          | —                    |
| `LeaveApprovalCaseId`    | `int`      | FK          | —                    |
| `StageNumber`            | `int`      | —           | —                    |
| `ApprovalSlotCode`       | `string`   | —           | —                    |
| `DecidedByUserAccountId` | `int`      | FK          | —                    |
| `Decision`               | `string`   | —           | Approved \| Rejected |
| `AuthorityCode`          | `string`   | —           | —                    |
| `EncryptedReason`        | `string`   | —           | —                    |
| `AssuranceLevel`         | `string`   | —           | —                    |
| `DecidedAt`              | `datetime` | —           | —                    |
| `CreatedAt`              | `datetime` | —           | —                    |

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.

Unpaid LOP enrollments track request/approval units without a balance account,
reservation or ledger debit/credit. Rules concerning reservations, posting and
allocations apply only to Balance tracking. Encashment contracts/configuration
are admitted; submission, external handoff and payment are disabled.

## TRACKING

LeavePolicyVersion includes required `TrackingMode: Balance | Unpaid`. Unpaid
enrollments retain units/approval history but have no account, reservation or
ledger posting. Payment/handoff entities are future-only and excluded from
current physical DDL. See the technical design for the explicit ID mapping.
