# Attendance & Work Schedule — Logical Data Model

Current-release applicability: the [approved decisions](../../roadmap/HCM-3-DECISIONS.md#decisions) and [owning technical design](TECHNICAL-DESIGN.md) explicitly exclude future logical entities/transitions for offline/device/geofence capture, auto-close, pooled claim/release, delegation creation, new step-up and encashment payment/handoff. Broader logical state/table catalogues below are not permission to implement those capabilities. Physical identity and exact-duration mappings are specified by the SQL TDD; Unpaid tracking is an explicit exception to account/reservation transitions.

This logical catalogue defines HCM-3 schedule/attendance facts. It is not DDL. SQL-first TDDs must reconcile it with current workforce/location models, current ID conventions and existing database migrations.

## WorkSchedule

| Field            | Type       | Constraints | Meaning           |
| ---------------- | ---------- | ----------- | ----------------- |
| `Id`             | `int`      | PK          | —                 |
| `PublicId`       | `uuid`     | UK          | —                 |
| `TenantId`       | `int`      | FK          | —                 |
| `OrganizationId` | `int`      | FK          | —                 |
| `Code`           | `string`   | UK          | —                 |
| `Name`           | `string`   | —           | —                 |
| `Description`    | `string`   | —           | —                 |
| `IsTemplate`     | `boolean`  | —           | —                 |
| `Status`         | `string`   | —           | Active \| Retired |
| `CreatedAt`      | `datetime` | —           | —                 |
| `CreatedBy`      | `string`   | —           | —                 |
| `UpdatedAt`      | `datetime` | —           | —                 |
| `UpdatedBy`      | `string`   | —           | —                 |

## WorkScheduleVersion

| Field                             | Type       | Constraints    | Meaning                                                     |
| --------------------------------- | ---------- | -------------- | ----------------------------------------------------------- |
| `Id`                              | `int`      | PK             | —                                                           |
| `PublicId`                        | `uuid`     | UK             | —                                                           |
| `TenantId`                        | `int`      | FK             | —                                                           |
| `WorkScheduleId`                  | `int`      | FK             | —                                                           |
| `VersionNumber`                   | `int`      | —              | —                                                           |
| `Status`                          | `string`   | —              | Draft \| Published \| Retired                               |
| `EffectiveFromDate`               | `date`     | —              | —                                                           |
| `EffectiveToDate`                 | `date`     | —              | —                                                           |
| `TimeZoneMode`                    | `string`   | —              | Employment \| Location \| Fixed                             |
| `FixedTimeZone`                   | `string`   | —              | —                                                           |
| `WeekStartsOn`                    | `int`      | —              | 1 Monday through 7 Sunday                                   |
| `MinimumRestMinutes`              | `int?`     | nullable, >= 0 | Null disables minimum-rest validation; no universal default |
| `SupersedesWorkScheduleVersionId` | `int`      | FK             | —                                                           |
| `CopiedFromWorkScheduleVersionId` | `int`      | FK             | —                                                           |
| `PublishedAt`                     | `datetime` | —              | —                                                           |
| `PublishedByUserAccountId`        | `int`      | FK             | —                                                           |
| `Version`                         | `int`      | —              | —                                                           |
| `CreatedAt`                       | `datetime` | —              | —                                                           |
| `CreatedBy`                       | `string`   | —              | —                                                           |
| `UpdatedAt`                       | `datetime` | —              | —                                                           |
| `UpdatedBy`                       | `string`   | —              | —                                                           |

## WorkScheduleDay

| Field                   | Type       | Constraints | Meaning                   |
| ----------------------- | ---------- | ----------- | ------------------------- |
| `Id`                    | `int`      | PK          | —                         |
| `PublicId`              | `uuid`     | UK          | —                         |
| `TenantId`              | `int`      | FK          | —                         |
| `WorkScheduleVersionId` | `int`      | FK          | —                         |
| `DayOfWeek`             | `int`      | —           | 1 Monday through 7 Sunday |
| `DayType`               | `string`   | —           | Workday \| WeeklyRest     |
| `ShiftVersionId`        | `int`      | FK          | —                         |
| `SortOrder`             | `int`      | —           | —                         |
| `CreatedAt`             | `datetime` | —           | —                         |
| `CreatedBy`             | `string`   | —           | —                         |

## WorkScheduleSegment

| Field               | Type       | Constraints | Meaning       |
| ------------------- | ---------- | ----------- | ------------- |
| `Id`                | `int`      | PK          | —             |
| `PublicId`          | `uuid`     | UK          | —             |
| `TenantId`          | `int`      | FK          | —             |
| `WorkScheduleDayId` | `int`      | FK          | —             |
| `SegmentType`       | `string`   | —           | Work \| Break |
| `StartLocalTime`    | `time`     | —           | —             |
| `StartDayOffset`    | `int`      | —           | —             |
| `EndLocalTime`      | `time`     | —           | —             |
| `EndDayOffset`      | `int`      | —           | —             |
| `IsPaid`            | `boolean`  | —           | —             |
| `SortOrder`         | `int`      | —           | —             |
| `CreatedAt`         | `datetime` | —           | —             |
| `CreatedBy`         | `string`   | —           | —             |

## Shift

| Field            | Type       | Constraints | Meaning           |
| ---------------- | ---------- | ----------- | ----------------- |
| `Id`             | `int`      | PK          | —                 |
| `PublicId`       | `uuid`     | UK          | —                 |
| `TenantId`       | `int`      | FK          | —                 |
| `OrganizationId` | `int`      | FK          | —                 |
| `Code`           | `string`   | UK          | —                 |
| `Name`           | `string`   | —           | —                 |
| `Description`    | `string`   | —           | —                 |
| `ColorCode`      | `string`   | —           | —                 |
| `Status`         | `string`   | —           | Active \| Retired |
| `CreatedAt`      | `datetime` | —           | —                 |
| `CreatedBy`      | `string`   | —           | —                 |
| `UpdatedAt`      | `datetime` | —           | —                 |
| `UpdatedBy`      | `string`   | —           | —                 |

## ShiftVersion

| Field                      | Type       | Constraints | Meaning                       |
| -------------------------- | ---------- | ----------- | ----------------------------- |
| `Id`                       | `int`      | PK          | —                             |
| `PublicId`                 | `uuid`     | UK          | —                             |
| `TenantId`                 | `int`      | FK          | —                             |
| `ShiftId`                  | `int`      | FK          | —                             |
| `VersionNumber`            | `int`      | —           | —                             |
| `Status`                   | `string`   | —           | Draft \| Published \| Retired |
| `EffectiveFromDate`        | `date`     | —           | —                             |
| `EffectiveToDate`          | `date`     | —           | —                             |
| `ScheduledMinutes`         | `int`      | —           | —                             |
| `MinimumRestAfterMinutes`  | `int`      | —           | —                             |
| `SupersedesShiftVersionId` | `int`      | FK          | —                             |
| `PublishedAt`              | `datetime` | —           | —                             |
| `PublishedByUserAccountId` | `int`      | FK          | —                             |
| `Version`                  | `int`      | —           | —                             |
| `CreatedAt`                | `datetime` | —           | —                             |
| `CreatedBy`                | `string`   | —           | —                             |
| `UpdatedAt`                | `datetime` | —           | —                             |
| `UpdatedBy`                | `string`   | —           | —                             |

## ShiftSegment

| Field            | Type       | Constraints | Meaning       |
| ---------------- | ---------- | ----------- | ------------- |
| `Id`             | `int`      | PK          | —             |
| `PublicId`       | `uuid`     | UK          | —             |
| `TenantId`       | `int`      | FK          | —             |
| `ShiftVersionId` | `int`      | FK          | —             |
| `SegmentType`    | `string`   | —           | Work \| Break |
| `StartLocalTime` | `time`     | —           | —             |
| `StartDayOffset` | `int`      | —           | —             |
| `EndLocalTime`   | `time`     | —           | —             |
| `EndDayOffset`   | `int`      | —           | —             |
| `IsPaid`         | `boolean`  | —           | —             |
| `SortOrder`      | `int`      | —           | —             |
| `CreatedAt`      | `datetime` | —           | —             |
| `CreatedBy`      | `string`   | —           | —             |

## HolidayCalendar

| Field            | Type       | Constraints | Meaning           |
| ---------------- | ---------- | ----------- | ----------------- |
| `Id`             | `int`      | PK          | —                 |
| `PublicId`       | `uuid`     | UK          | —                 |
| `TenantId`       | `int`      | FK          | —                 |
| `OrganizationId` | `int`      | FK          | —                 |
| `Code`           | `string`   | UK          | —                 |
| `Name`           | `string`   | —           | —                 |
| `Description`    | `string`   | —           | —                 |
| `Status`         | `string`   | —           | Active \| Retired |
| `CreatedAt`      | `datetime` | —           | —                 |
| `CreatedBy`      | `string`   | —           | —                 |
| `UpdatedAt`      | `datetime` | —           | —                 |
| `UpdatedBy`      | `string`   | —           | —                 |

## HolidayCalendarVersion

| Field                                | Type       | Constraints | Meaning                       |
| ------------------------------------ | ---------- | ----------- | ----------------------------- |
| `Id`                                 | `int`      | PK          | —                             |
| `PublicId`                           | `uuid`     | UK          | —                             |
| `TenantId`                           | `int`      | FK          | —                             |
| `HolidayCalendarId`                  | `int`      | FK          | —                             |
| `VersionNumber`                      | `int`      | —           | —                             |
| `Status`                             | `string`   | —           | Draft \| Published \| Retired |
| `EffectiveFromDate`                  | `date`     | —           | —                             |
| `EffectiveToDate`                    | `date`     | —           | —                             |
| `SupersedesHolidayCalendarVersionId` | `int`      | FK          | —                             |
| `PublishedAt`                        | `datetime` | —           | —                             |
| `PublishedByUserAccountId`           | `int`      | FK          | —                             |
| `Version`                            | `int`      | —           | —                             |
| `CreatedAt`                          | `datetime` | —           | —                             |
| `CreatedBy`                          | `string`   | —           | —                             |
| `UpdatedAt`                          | `datetime` | —           | —                             |
| `UpdatedBy`                          | `string`   | —           | —                             |

## Holiday

| Field                      | Type       | Constraints | Meaning                                     |
| -------------------------- | ---------- | ----------- | ------------------------------------------- |
| `Id`                       | `int`      | PK          | —                                           |
| `PublicId`                 | `uuid`     | UK          | —                                           |
| `TenantId`                 | `int`      | FK          | —                                           |
| `HolidayCalendarVersionId` | `int`      | FK          | —                                           |
| `Code`                     | `string`   | —           | —                                           |
| `Name`                     | `string`   | —           | —                                           |
| `Category`                 | `string`   | —           | Public \| Company \| Regional \| Substitute |
| `ActualDate`               | `date`     | —           | —                                           |
| `ObservedDate`             | `date`     | —           | —                                           |
| `IsPartialDay`             | `boolean`  | —           | —                                           |
| `StartLocalTime`           | `time`     | —           | —                                           |
| `EndLocalTime`             | `time`     | —           | —                                           |
| `Priority`                 | `int`      | —           | —                                           |
| `CreatedAt`                | `datetime` | —           | —                                           |
| `CreatedBy`                | `string`   | —           | —                                           |

## AttendancePolicy

| Field            | Type       | Constraints | Meaning           |
| ---------------- | ---------- | ----------- | ----------------- |
| `Id`             | `int`      | PK          | —                 |
| `PublicId`       | `uuid`     | UK          | —                 |
| `TenantId`       | `int`      | FK          | —                 |
| `OrganizationId` | `int`      | FK          | —                 |
| `Code`           | `string`   | UK          | —                 |
| `Name`           | `string`   | —           | —                 |
| `Description`    | `string`   | —           | —                 |
| `Status`         | `string`   | —           | Active \| Retired |
| `CreatedAt`      | `datetime` | —           | —                 |
| `CreatedBy`      | `string`   | —           | —                 |
| `UpdatedAt`      | `datetime` | —           | —                 |
| `UpdatedBy`      | `string`   | —           | —                 |

## AttendancePolicyVersion

| Field                                 | Type       | Constraints | Meaning                       |
| ------------------------------------- | ---------- | ----------- | ----------------------------- |
| `Id`                                  | `int`      | PK          | —                             |
| `PublicId`                            | `uuid`     | UK          | —                             |
| `TenantId`                            | `int`      | FK          | —                             |
| `AttendancePolicyId`                  | `int`      | FK          | —                             |
| `VersionNumber`                       | `int`      | —           | —                             |
| `Status`                              | `string`   | —           | Draft \| Published \| Retired |
| `EffectiveFromDate`                   | `date`     | —           | —                             |
| `EffectiveToDate`                     | `date`     | —           | —                             |
| `ClockInBeforeMinutes`                | `int`      | —           | —                             |
| `ClockOutAfterMinutes`                | `int`      | —           | —                             |
| `MaximumOfflineAgeMinutes`            | `int`      | —           | —                             |
| `RequireLocation`                     | `boolean`  | —           | —                             |
| `OutsideLocationEffect`               | `string`   | —           | Deny \| Review \| Allow       |
| `LateGraceMinutes`                    | `int`      | —           | —                             |
| `EarlyDepartureGraceMinutes`          | `int`      | —           | —                             |
| `MinimumBreakMinutes`                 | `int`      | —           | —                             |
| `AutoCloseAfterMinutes`               | `int`      | —           | —                             |
| `PairingMode`                         | `string`   | —           | Strict \| Alternating         |
| `RoundingMode`                        | `string`   | —           | None \| Down \| HalfUp \| Up  |
| `RoundingIncrementMinutes`            | `int`      | —           | —                             |
| `RoundingBoundary`                    | `string`   | —           | DayTotal \| Classification    |
| `OvertimeAfterMinutes`                | `int`      | —           | —                             |
| `RequireOvertimeApproval`             | `boolean`  | —           | —                             |
| `RequireCorrectionApproval`           | `boolean`  | —           | —                             |
| `CorrectionWindowDays`                | `int`      | —           | —                             |
| `SupersedesAttendancePolicyVersionId` | `int`      | FK          | —                             |
| `PublishedAt`                         | `datetime` | —           | —                             |
| `PublishedByUserAccountId`            | `int`      | FK          | —                             |
| `Version`                             | `int`      | —           | —                             |
| `CreatedAt`                           | `datetime` | —           | —                             |
| `CreatedBy`                           | `string`   | —           | —                             |
| `UpdatedAt`                           | `datetime` | —           | —                             |
| `UpdatedBy`                           | `string`   | —           | —                             |

## AttendanceApprovalRule

| Field                       | Type       | Constraints | Meaning                                                                                     |
| --------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------- |
| `Id`                        | `int`      | PK          | —                                                                                           |
| `PublicId`                  | `uuid`     | UK          | —                                                                                           |
| `TenantId`                  | `int`      | FK          | —                                                                                           |
| `AttendancePolicyVersionId` | `int`      | FK          | —                                                                                           |
| `SubjectType`               | `string`   | —           | Correction \| Adjustment \| Overtime \| Roster \| Override \| AnomalyWaiver \| PeriodReopen |
| `StageNumber`               | `int`      | —           | —                                                                                           |
| `ApprovalSlotCode`          | `string`   | —           | —                                                                                           |
| `ApproverSource`            | `string`   | —           | LineManager \| ManagerLevel \| Function \| NamedUser                                        |
| `ManagerLevel`              | `int`      | —           | —                                                                                           |
| `ApproverFunctionCode`      | `string`   | —           | —                                                                                           |
| `ApproverUserAccountId`     | `int`      | FK          | —                                                                                           |
| `ThresholdFromMinutes`      | `int`      | —           | —                                                                                           |
| `ThresholdToMinutes`        | `int`      | —           | —                                                                                           |
| `IsRequired`                | `boolean`  | —           | —                                                                                           |
| `CreatedAt`                 | `datetime` | —           | —                                                                                           |
| `CreatedBy`                 | `string`   | —           | —                                                                                           |

## TimeConfigurationImpactPreview

| Field                        | Type       | Constraints | Meaning                                           |
| ---------------------------- | ---------- | ----------- | ------------------------------------------------- |
| `Id`                         | `int`      | PK          | —                                                 |
| `PublicId`                   | `uuid`     | UK          | —                                                 |
| `TenantId`                   | `int`      | FK          | —                                                 |
| `WorkScheduleVersionId`      | `int`      | FK          | —                                                 |
| `ShiftVersionId`             | `int`      | FK          | —                                                 |
| `HolidayCalendarVersionId`   | `int`      | FK          | —                                                 |
| `AttendancePolicyVersionId`  | `int`      | FK          | —                                                 |
| `Status`                     | `string`   | —           | Running \| Ready \| Failed \| Expired \| Consumed |
| `SourceWorkforceVersion`     | `string`   | —           | —                                                 |
| `SourceConfigurationVersion` | `string`   | —           | —                                                 |
| `FromDate`                   | `date`     | —           | —                                                 |
| `ToDate`                     | `date`     | —           | —                                                 |
| `EvaluatedEmploymentCount`   | `int`      | —           | —                                                 |
| `AffectedWorkdayCount`       | `int`      | —           | —                                                 |
| `ConflictCount`              | `int`      | —           | —                                                 |
| `LockedImpactCount`          | `int`      | —           | —                                                 |
| `ImpactDigest`               | `string`   | —           | —                                                 |
| `RequestedAt`                | `datetime` | —           | —                                                 |
| `RequestedByUserAccountId`   | `int`      | FK          | —                                                 |
| `CompletedAt`                | `datetime` | —           | —                                                 |
| `ExpiresAt`                  | `datetime` | —           | —                                                 |
| `FailureCode`                | `string`   | —           | —                                                 |
| `CreatedAt`                  | `datetime` | —           | —                                                 |
| `UpdatedAt`                  | `datetime` | —           | —                                                 |

## ScheduleAssignment

| Field                   | Type       | Constraints | Meaning                                                                                      |
| ----------------------- | ---------- | ----------- | -------------------------------------------------------------------------------------------- |
| `Id`                    | `int`      | PK          | —                                                                                            |
| `PublicId`              | `uuid`     | UK          | —                                                                                            |
| `TenantId`              | `int`      | FK          | —                                                                                            |
| `WorkScheduleVersionId` | `int`      | FK          | —                                                                                            |
| `ScopeType`             | `string`   | —           | Organization \| LegalEntity \| OrgUnit \| Department \| Location \| Assignment \| Employment |
| `OrganizationId`        | `int`      | FK          | —                                                                                            |
| `LegalEntityId`         | `int`      | FK          | —                                                                                            |
| `OrgUnitId`             | `int`      | FK          | —                                                                                            |
| `DepartmentId`          | `int`      | FK          | —                                                                                            |
| `LocationId`            | `int`      | FK          | —                                                                                            |
| `AssignmentId`          | `int`      | FK          | —                                                                                            |
| `EmploymentId`          | `int`      | FK          | —                                                                                            |
| `EffectiveFromDate`     | `date`     | —           | —                                                                                            |
| `EffectiveToDate`       | `date`     | —           | —                                                                                            |
| `Priority`              | `int`      | —           | —                                                                                            |
| `CreatedAt`             | `datetime` | —           | —                                                                                            |
| `CreatedBy`             | `string`   | —           | —                                                                                            |
| `UpdatedAt`             | `datetime` | —           | —                                                                                            |
| `UpdatedBy`             | `string`   | —           | —                                                                                            |

## AttendancePolicyAssignment

| Field                       | Type       | Constraints | Meaning                                                                                      |
| --------------------------- | ---------- | ----------- | -------------------------------------------------------------------------------------------- |
| `Id`                        | `int`      | PK          | —                                                                                            |
| `PublicId`                  | `uuid`     | UK          | —                                                                                            |
| `TenantId`                  | `int`      | FK          | —                                                                                            |
| `AttendancePolicyVersionId` | `int`      | FK          | —                                                                                            |
| `ScopeType`                 | `string`   | —           | Organization \| LegalEntity \| OrgUnit \| Department \| Location \| Assignment \| Employment |
| `OrganizationId`            | `int`      | FK          | —                                                                                            |
| `LegalEntityId`             | `int`      | FK          | —                                                                                            |
| `OrgUnitId`                 | `int`      | FK          | —                                                                                            |
| `DepartmentId`              | `int`      | FK          | —                                                                                            |
| `LocationId`                | `int`      | FK          | —                                                                                            |
| `AssignmentId`              | `int`      | FK          | —                                                                                            |
| `EmploymentId`              | `int`      | FK          | —                                                                                            |
| `EffectiveFromDate`         | `date`     | —           | —                                                                                            |
| `EffectiveToDate`           | `date`     | —           | —                                                                                            |
| `Priority`                  | `int`      | —           | —                                                                                            |
| `CreatedAt`                 | `datetime` | —           | —                                                                                            |
| `CreatedBy`                 | `string`   | —           | —                                                                                            |
| `UpdatedAt`                 | `datetime` | —           | —                                                                                            |
| `UpdatedBy`                 | `string`   | —           | —                                                                                            |

## HolidayCalendarAssignment

| Field                      | Type       | Constraints | Meaning                                                                                      |
| -------------------------- | ---------- | ----------- | -------------------------------------------------------------------------------------------- |
| `Id`                       | `int`      | PK          | —                                                                                            |
| `PublicId`                 | `uuid`     | UK          | —                                                                                            |
| `TenantId`                 | `int`      | FK          | —                                                                                            |
| `HolidayCalendarVersionId` | `int`      | FK          | —                                                                                            |
| `ScopeType`                | `string`   | —           | Organization \| LegalEntity \| OrgUnit \| Department \| Location \| Assignment \| Employment |
| `OrganizationId`           | `int`      | FK          | —                                                                                            |
| `LegalEntityId`            | `int`      | FK          | —                                                                                            |
| `OrgUnitId`                | `int`      | FK          | —                                                                                            |
| `DepartmentId`             | `int`      | FK          | —                                                                                            |
| `LocationId`               | `int`      | FK          | —                                                                                            |
| `AssignmentId`             | `int`      | FK          | —                                                                                            |
| `EmploymentId`             | `int`      | FK          | —                                                                                            |
| `EffectiveFromDate`        | `date`     | —           | —                                                                                            |
| `EffectiveToDate`          | `date`     | —           | —                                                                                            |
| `Priority`                 | `int`      | —           | —                                                                                            |
| `CreatedAt`                | `datetime` | —           | —                                                                                            |
| `CreatedBy`                | `string`   | —           | —                                                                                            |
| `UpdatedAt`                | `datetime` | —           | —                                                                                            |
| `UpdatedBy`                | `string`   | —           | —                                                                                            |

## ScheduleOverride

| Field                          | Type       | Constraints | Meaning                                        |
| ------------------------------ | ---------- | ----------- | ---------------------------------------------- |
| `Id`                           | `int`      | PK          | —                                              |
| `PublicId`                     | `uuid`     | UK          | —                                              |
| `TenantId`                     | `int`      | FK          | —                                              |
| `EmploymentId`                 | `int`      | FK          | —                                              |
| `WorkDate`                     | `date`     | —           | —                                              |
| `OverrideType`                 | `string`   | —           | NonWorking \| AlternateShift \| CustomInterval |
| `ShiftVersionId`               | `int`      | FK          | —                                              |
| `StartLocalTime`               | `time`     | —           | —                                              |
| `EndLocalTime`                 | `time`     | —           | —                                              |
| `EndDayOffset`                 | `int`      | —           | —                                              |
| `ReasonCode`                   | `string`   | —           | —                                              |
| `Status`                       | `string`   | —           | Draft \| Approved \| Cancelled \| Superseded   |
| `SupersedesScheduleOverrideId` | `int`      | FK          | —                                              |
| `Version`                      | `int`      | —           | —                                              |
| `CreatedAt`                    | `datetime` | —           | —                                              |
| `CreatedByUserAccountId`       | `int`      | FK          | —                                              |
| `UpdatedAt`                    | `datetime` | —           | —                                              |

## ShiftRoster

| Field                      | Type       | Constraints | Meaning                                                                      |
| -------------------------- | ---------- | ----------- | ---------------------------------------------------------------------------- |
| `Id`                       | `int`      | PK          | —                                                                            |
| `PublicId`                 | `uuid`     | UK          | —                                                                            |
| `TenantId`                 | `int`      | FK          | —                                                                            |
| `OrganizationId`           | `int`      | FK          | —                                                                            |
| `RosterNumber`             | `string`   | —           | —                                                                            |
| `StartDate`                | `date`     | —           | —                                                                            |
| `EndDate`                  | `date`     | —           | —                                                                            |
| `VersionNumber`            | `int`      | —           | —                                                                            |
| `Status`                   | `string`   | —           | Draft \| PendingApproval \| Published \| Rejected \| Cancelled \| Superseded |
| `SupersedesShiftRosterId`  | `int`      | FK          | —                                                                            |
| `ImpactDigest`             | `string`   | —           | —                                                                            |
| `Version`                  | `int`      | —           | —                                                                            |
| `SubmittedAt`              | `datetime` | —           | —                                                                            |
| `PublishedAt`              | `datetime` | —           | —                                                                            |
| `PublishedByUserAccountId` | `int`      | FK          | —                                                                            |
| `CreatedAt`                | `datetime` | —           | —                                                                            |
| `CreatedByUserAccountId`   | `int`      | FK          | —                                                                            |
| `UpdatedAt`                | `datetime` | —           | —                                                                            |

## ShiftRosterEntry

| Field            | Type       | Constraints | Meaning                                         |
| ---------------- | ---------- | ----------- | ----------------------------------------------- |
| `Id`             | `int`      | PK          | —                                               |
| `PublicId`       | `uuid`     | UK          | —                                               |
| `TenantId`       | `int`      | FK          | —                                               |
| `ShiftRosterId`  | `int`      | FK          | —                                               |
| `EmploymentId`   | `int`      | FK          | —                                               |
| `AssignmentId`   | `int`      | FK          | —                                               |
| `WorkDate`       | `date`     | —           | —                                               |
| `ShiftVersionId` | `int`      | FK          | —                                               |
| `Status`         | `string`   | —           | Planned \| Published \| Cancelled \| Superseded |
| `Note`           | `string`   | —           | —                                               |
| `CreatedAt`      | `datetime` | —           | —                                               |
| `CreatedBy`      | `string`   | —           | —                                               |
| `UpdatedAt`      | `datetime` | —           | —                                               |
| `UpdatedBy`      | `string`   | —           | —                                               |

## PublishedWorkday

| Field                          | Type       | Constraints | Meaning                                                |
| ------------------------------ | ---------- | ----------- | ------------------------------------------------------ |
| `Id`                           | `int`      | PK          | —                                                      |
| `PublicId`                     | `uuid`     | UK          | —                                                      |
| `TenantId`                     | `int`      | FK          | —                                                      |
| `EmploymentId`                 | `int`      | FK          | —                                                      |
| `AssignmentId`                 | `int`      | FK          | —                                                      |
| `WorkDate`                     | `date`     | —           | —                                                      |
| `TimeZone`                     | `string`   | —           | —                                                      |
| `WorkScheduleVersionId`        | `int`      | FK          | —                                                      |
| `HolidayCalendarVersionId`     | `int`      | FK          | —                                                      |
| `AttendancePolicyVersionId`    | `int`      | FK          | —                                                      |
| `ShiftRosterEntryId`           | `int`      | FK          | —                                                      |
| `ScheduleOverrideId`           | `int`      | FK          | —                                                      |
| `ShiftVersionId`               | `int`      | FK          | —                                                      |
| `DayType`                      | `string`   | —           | Workday \| WeeklyRest \| Holiday \| NonWorkingOverride |
| `PlannedWorkMinutes`           | `int`      | —           | —                                                      |
| `PlannedBreakMinutes`          | `int`      | —           | —                                                      |
| `HolidayMinutes`               | `int`      | —           | —                                                      |
| `ResolutionDigest`             | `string`   | —           | —                                                      |
| `RevisionNumber`               | `int`      | —           | —                                                      |
| `SupersedesPublishedWorkdayId` | `int`      | FK          | —                                                      |
| `Status`                       | `string`   | —           | Published \| Superseded \| Invalid                     |
| `ResolvedAt`                   | `datetime` | —           | —                                                      |
| `CreatedAt`                    | `datetime` | —           | —                                                      |

## PublishedWorkSegment

| Field                   | Type       | Constraints | Meaning                  |
| ----------------------- | ---------- | ----------- | ------------------------ |
| `Id`                    | `int`      | PK          | —                        |
| `PublicId`              | `uuid`     | UK          | —                        |
| `TenantId`              | `int`      | FK          | —                        |
| `PublishedWorkdayId`    | `int`      | FK          | —                        |
| `HolidayId`             | `int`      | FK          | —                        |
| `SegmentType`           | `string`   | —           | Work \| Break \| Holiday |
| `StartAt`               | `datetime` | —           | —                        |
| `EndAt`                 | `datetime` | —           | —                        |
| `StartLocalTime`        | `time`     | —           | —                        |
| `EndLocalTime`          | `time`     | —           | —                        |
| `StartUtcOffsetMinutes` | `int`      | —           | —                        |
| `EndUtcOffsetMinutes`   | `int`      | —           | —                        |
| `IsPaid`                | `boolean`  | —           | —                        |
| `SortOrder`             | `int`      | —           | —                        |
| `CreatedAt`             | `datetime` | —           | —                        |

## AttendanceCaptureSource

| Field                  | Type       | Constraints | Meaning                                                   |
| ---------------------- | ---------- | ----------- | --------------------------------------------------------- |
| `Id`                   | `int`      | PK          | —                                                         |
| `PublicId`             | `uuid`     | UK          | —                                                         |
| `TenantId`             | `int`      | FK          | —                                                         |
| `OrganizationId`       | `int`      | FK          | —                                                         |
| `LocationId`           | `int`      | FK          | —                                                         |
| `ApiCredentialId`      | `int`      | FK          | —                                                         |
| `Code`                 | `string`   | UK          | —                                                         |
| `Name`                 | `string`   | —           | —                                                         |
| `SourceType`           | `string`   | —           | Web \| Mobile \| Kiosk \| Device \| Integration \| Import |
| `ProviderCode`         | `string`   | —           | —                                                         |
| `Status`               | `string`   | —           | Draft \| Active \| Suspended \| Retired                   |
| `GeofenceLatitude`     | `decimal`  | —           | —                                                         |
| `GeofenceLongitude`    | `decimal`  | —           | —                                                         |
| `GeofenceRadiusMeters` | `int`      | —           | —                                                         |
| `CredentialRotatedAt`  | `datetime` | —           | —                                                         |
| `CreatedAt`            | `datetime` | —           | —                                                         |
| `CreatedBy`            | `string`   | —           | —                                                         |
| `UpdatedAt`            | `datetime` | —           | —                                                         |
| `UpdatedBy`            | `string`   | —           | —                                                         |

## AttendanceEvent

| Field                         | Type       | Constraints | Meaning                                           |
| ----------------------------- | ---------- | ----------- | ------------------------------------------------- |
| `Id`                          | `int`      | PK          | —                                                 |
| `PublicId`                    | `uuid`     | UK          | —                                                 |
| `TenantId`                    | `int`      | FK          | —                                                 |
| `AttendanceCaptureSourceId`   | `int`      | FK          | —                                                 |
| `EmploymentId`                | `int`      | FK          | —                                                 |
| `AssignmentId`                | `int`      | FK          | —                                                 |
| `SourceEventKey`              | `string`   | —           | —                                                 |
| `EventType`                   | `string`   | —           | In \| Out \| BreakStart \| BreakEnd               |
| `OccurredAt`                  | `datetime` | —           | —                                                 |
| `ReceivedAt`                  | `datetime` | —           | —                                                 |
| `LocalWorkDate`               | `date`     | —           | —                                                 |
| `OccurredLocalTime`           | `time`     | —           | —                                                 |
| `TimeZone`                    | `string`   | —           | —                                                 |
| `UtcOffsetMinutes`            | `int`      | —           | —                                                 |
| `IngestionStatus`             | `string`   | —           | Accepted \| PendingReview \| Rejected             |
| `LocationResult`              | `string`   | —           | Inside \| Outside \| Indeterminate \| NotRequired |
| `Latitude`                    | `decimal`  | —           | —                                                 |
| `Longitude`                   | `decimal`  | —           | —                                                 |
| `IpAddress`                   | `string`   | —           | —                                                 |
| `DeviceAssertion`             | `string`   | —           | —                                                 |
| `SupersedesAttendanceEventId` | `int`      | FK          | —                                                 |
| `NormalizedDigest`            | `string`   | —           | —                                                 |
| `CreatedAt`                   | `datetime` | —           | —                                                 |

## AttendanceImportBatch

| Field                       | Type       | Constraints | Meaning                                                                                         |
| --------------------------- | ---------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `Id`                        | `int`      | PK          | —                                                                                               |
| `PublicId`                  | `uuid`     | UK          | —                                                                                               |
| `TenantId`                  | `int`      | FK          | —                                                                                               |
| `AttendanceCaptureSourceId` | `int`      | FK          | —                                                                                               |
| `EvidenceDocumentId`        | `int`      | FK          | —                                                                                               |
| `BatchNumber`               | `string`   | UK          | —                                                                                               |
| `ProviderSchemaVersion`     | `string`   | —           | —                                                                                               |
| `ContentDigest`             | `string`   | —           | —                                                                                               |
| `Status`                    | `string`   | —           | Received \| Validating \| Processing \| Completed \| CompletedWithErrors \| Failed \| Cancelled |
| `TotalRowCount`             | `int`      | —           | —                                                                                               |
| `SucceededRowCount`         | `int`      | —           | —                                                                                               |
| `FailedRowCount`            | `int`      | —           | —                                                                                               |
| `SubmittedAt`               | `datetime` | —           | —                                                                                               |
| `SubmittedByUserAccountId`  | `int`      | FK          | —                                                                                               |
| `CompletedAt`               | `datetime` | —           | —                                                                                               |
| `FailureCode`               | `string`   | —           | —                                                                                               |
| `CreatedAt`                 | `datetime` | —           | —                                                                                               |
| `UpdatedAt`                 | `datetime` | —           | —                                                                                               |

## AttendanceImportRow

| Field                     | Type       | Constraints | Meaning                                                 |
| ------------------------- | ---------- | ----------- | ------------------------------------------------------- |
| `Id`                      | `int`      | PK          | —                                                       |
| `PublicId`                | `uuid`     | UK          | —                                                       |
| `TenantId`                | `int`      | FK          | —                                                       |
| `AttendanceImportBatchId` | `int`      | FK          | —                                                       |
| `RowNumber`               | `int`      | —           | —                                                       |
| `SourceEventKey`          | `string`   | —           | —                                                       |
| `NormalizedDigest`        | `string`   | —           | —                                                       |
| `Status`                  | `string`   | —           | Pending \| Processing \| Accepted \| Rejected \| Failed |
| `AttendanceEventId`       | `int`      | FK          | —                                                       |
| `ErrorCode`               | `string`   | —           | —                                                       |
| `ProcessedAt`             | `datetime` | —           | —                                                       |
| `CreatedAt`               | `datetime` | —           | —                                                       |
| `UpdatedAt`               | `datetime` | —           | —                                                       |

## AttendancePeriod

| Field                           | Type       | Constraints | Meaning                                          |
| ------------------------------- | ---------- | ----------- | ------------------------------------------------ |
| `Id`                            | `int`      | PK          | —                                                |
| `PublicId`                      | `uuid`     | UK          | —                                                |
| `TenantId`                      | `int`      | FK          | —                                                |
| `OrganizationId`                | `int`      | FK          | —                                                |
| `Code`                          | `string`   | UK          | —                                                |
| `Name`                          | `string`   | —           | —                                                |
| `StartDate`                     | `date`     | —           | —                                                |
| `EndDate`                       | `date`     | —           | —                                                |
| `Status`                        | `string`   | —           | Planned \| Open \| Closing \| Locked \| Reopened |
| `CurrentAttendancePeriodLockId` | `int`      | FK          | —                                                |
| `Version`                       | `int`      | —           | —                                                |
| `CreatedAt`                     | `datetime` | —           | —                                                |
| `CreatedBy`                     | `string`   | —           | —                                                |
| `UpdatedAt`                     | `datetime` | —           | —                                                |
| `UpdatedBy`                     | `string`   | —           | —                                                |

## AttendancePeriodLock

| Field                              | Type       | Constraints | Meaning              |
| ---------------------------------- | ---------- | ----------- | -------------------- |
| `Id`                               | `int`      | PK          | —                    |
| `PublicId`                         | `uuid`     | UK          | —                    |
| `TenantId`                         | `int`      | FK          | —                    |
| `AttendancePeriodId`               | `int`      | FK          | —                    |
| `LockNumber`                       | `int`      | —           | —                    |
| `Status`                           | `string`   | —           | Active \| Superseded |
| `ReconciliationDigest`             | `string`   | —           | —                    |
| `InputDigest`                      | `string`   | —           | —                    |
| `OutputDigest`                     | `string`   | —           | —                    |
| `SupersedesAttendancePeriodLockId` | `int`      | FK          | —                    |
| `LockedAt`                         | `datetime` | —           | —                    |
| `LockedByUserAccountId`            | `int`      | FK          | —                    |
| `ReopenedAt`                       | `datetime` | —           | —                    |
| `ReopenedByUserAccountId`          | `int`      | FK          | —                    |
| `ReopenReason`                     | `string`   | —           | —                    |
| `CreatedAt`                        | `datetime` | —           | —                    |

## AttendanceCalculationRun

| Field                    | Type       | Constraints | Meaning                                                                       |
| ------------------------ | ---------- | ----------- | ----------------------------------------------------------------------------- |
| `Id`                     | `int`      | PK          | —                                                                             |
| `PublicId`               | `uuid`     | UK          | —                                                                             |
| `TenantId`               | `int`      | FK          | —                                                                             |
| `AttendancePeriodId`     | `int`      | FK          | —                                                                             |
| `RunNumber`              | `string`   | UK          | —                                                                             |
| `RunType`                | `string`   | —           | Scheduled \| OnDemand \| Correction \| Reconciliation \| Migration            |
| `FromDate`               | `date`     | —           | —                                                                             |
| `ToDate`                 | `date`     | —           | —                                                                             |
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

## AttendanceCalculationRunItem

| Field                        | Type       | Constraints | Meaning                                                  |
| ---------------------------- | ---------- | ----------- | -------------------------------------------------------- |
| `Id`                         | `int`      | PK          | —                                                        |
| `PublicId`                   | `uuid`     | UK          | —                                                        |
| `TenantId`                   | `int`      | FK          | —                                                        |
| `AttendanceCalculationRunId` | `int`      | FK          | —                                                        |
| `EmploymentId`               | `int`      | FK          | —                                                        |
| `WorkDate`                   | `date`     | —           | —                                                        |
| `PublishedWorkdayId`         | `int`      | FK          | —                                                        |
| `InputDigest`                | `string`   | —           | —                                                        |
| `Status`                     | `string`   | —           | Pending \| Processing \| Calculated \| Skipped \| Failed |
| `AttendanceDayId`            | `int`      | FK          | —                                                        |
| `FailureCode`                | `string`   | —           | —                                                        |
| `LeaseExpiresAt`             | `datetime` | —           | —                                                        |
| `FencingToken`               | `int`      | —           | —                                                        |
| `ProcessedAt`                | `datetime` | —           | —                                                        |
| `CreatedAt`                  | `datetime` | —           | —                                                        |
| `UpdatedAt`                  | `datetime` | —           | —                                                        |

## AttendanceDay

| Field                       | Type       | Constraints | Meaning                                                                        |
| --------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------ |
| `Id`                        | `int`      | PK          | —                                                                              |
| `PublicId`                  | `uuid`     | UK          | —                                                                              |
| `TenantId`                  | `int`      | FK          | —                                                                              |
| `AttendancePeriodId`        | `int`      | FK          | —                                                                              |
| `PublishedWorkdayId`        | `int`      | FK          | —                                                                              |
| `EmploymentId`              | `int`      | FK          | —                                                                              |
| `AssignmentId`              | `int`      | FK          | —                                                                              |
| `WorkDate`                  | `date`     | —           | —                                                                              |
| `TimeZone`                  | `string`   | —           | —                                                                              |
| `CalculationRevision`       | `int`      | —           | —                                                                              |
| `SupersedesAttendanceDayId` | `int`      | FK          | —                                                                              |
| `Status`                    | `string`   | —           | Calculated \| PendingApproval \| Approved \| Exception \| Locked \| Superseded |
| `ScheduledWorkMinutes`      | `int`      | —           | —                                                                              |
| `ExactWorkMinutes`          | `int`      | —           | —                                                                              |
| `ExactBreakMinutes`         | `int`      | —           | —                                                                              |
| `CountedWorkMinutes`        | `int`      | —           | —                                                                              |
| `LateMinutes`               | `int`      | —           | —                                                                              |
| `EarlyDepartureMinutes`     | `int`      | —           | —                                                                              |
| `AbsenceMinutes`            | `int`      | —           | —                                                                              |
| `OvertimeMinutes`           | `int`      | —           | —                                                                              |
| `ApprovedOvertimeMinutes`   | `int`      | —           | —                                                                              |
| `HolidayWorkMinutes`        | `int`      | —           | —                                                                              |
| `WeeklyRestWorkMinutes`     | `int`      | —           | —                                                                              |
| `AdjustmentMinutes`         | `int`      | —           | —                                                                              |
| `InputDigest`               | `string`   | —           | —                                                                              |
| `CalculationDigest`         | `string`   | —           | —                                                                              |
| `Version`                   | `int`      | —           | —                                                                              |
| `CalculatedAt`              | `datetime` | —           | —                                                                              |
| `ApprovedAt`                | `datetime` | —           | —                                                                              |
| `LockedAt`                  | `datetime` | —           | —                                                                              |
| `CreatedAt`                 | `datetime` | —           | —                                                                              |
| `UpdatedAt`                 | `datetime` | —           | —                                                                              |

## AttendanceSession

| Field                    | Type       | Constraints | Meaning                           |
| ------------------------ | ---------- | ----------- | --------------------------------- |
| `Id`                     | `int`      | PK          | —                                 |
| `PublicId`               | `uuid`     | UK          | —                                 |
| `TenantId`               | `int`      | FK          | —                                 |
| `AttendanceDayId`        | `int`      | FK          | —                                 |
| `StartAttendanceEventId` | `int`      | FK          | —                                 |
| `EndAttendanceEventId`   | `int`      | FK          | —                                 |
| `SessionType`            | `string`   | —           | Work \| Break                     |
| `StartAt`                | `datetime` | —           | —                                 |
| `EndAt`                  | `datetime` | —           | —                                 |
| `ExactMinutes`           | `int`      | —           | —                                 |
| `CountedMinutes`         | `int`      | —           | —                                 |
| `BoundarySource`         | `string`   | —           | Events \| AutoClose \| Correction |
| `SortOrder`              | `int`      | —           | —                                 |
| `CreatedAt`              | `datetime` | —           | —                                 |

## AttendanceAnomaly

| Field                     | Type       | Constraints | Meaning                                                                                                                                            |
| ------------------------- | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Id`                      | `int`      | PK          | —                                                                                                                                                  |
| `PublicId`                | `uuid`     | UK          | —                                                                                                                                                  |
| `TenantId`                | `int`      | FK          | —                                                                                                                                                  |
| `AttendanceDayId`         | `int`      | FK          | —                                                                                                                                                  |
| `AnomalyType`             | `string`   | —           | MissingIn \| MissingOut \| DuplicateDirection \| Overlap \| UnexpectedWork \| Location \| OfflineDelay \| RestViolation \| SourceConflict \| Other |
| `Severity`                | `string`   | —           | Info \| Warning \| Blocking                                                                                                                        |
| `Status`                  | `string`   | —           | Open \| Acknowledged \| Resolved \| Waived                                                                                                         |
| `RuleCode`                | `string`   | —           | —                                                                                                                                                  |
| `ResolutionCode`          | `string`   | —           | —                                                                                                                                                  |
| `ResolvedByUserAccountId` | `int`      | FK          | —                                                                                                                                                  |
| `ResolvedAt`              | `datetime` | —           | —                                                                                                                                                  |
| `CreatedAt`               | `datetime` | —           | —                                                                                                                                                  |
| `UpdatedAt`               | `datetime` | —           | —                                                                                                                                                  |

## AttendanceCorrectionRequest

| Field                    | Type       | Constraints | Meaning                                                                                                                    |
| ------------------------ | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Id`                     | `int`      | PK          | —                                                                                                                          |
| `PublicId`               | `uuid`     | UK          | —                                                                                                                          |
| `TenantId`               | `int`      | FK          | —                                                                                                                          |
| `RequestNumber`          | `string`   | UK          | —                                                                                                                          |
| `AttendanceDayId`        | `int`      | FK          | —                                                                                                                          |
| `EmploymentId`           | `int`      | FK          | —                                                                                                                          |
| `ReasonCode`             | `string`   | —           | —                                                                                                                          |
| `ReasonDetail`           | `string`   | —           | —                                                                                                                          |
| `EvidenceDocumentId`     | `int`      | FK          | —                                                                                                                          |
| `Status`                 | `string`   | —           | Draft \| Submitted \| PendingApproval \| Approved \| Rejected \| Withdrawn \| Applying \| Applied \| Failed \| Invalidated |
| `SubjectVersionAtSubmit` | `int`      | —           | —                                                                                                                          |
| `AppliedAttendanceDayId` | `int`      | FK          | —                                                                                                                          |
| `PreviewDigest`          | `string`   | —           | —                                                                                                                          |
| `IdempotencyKey`         | `string`   | —           | —                                                                                                                          |
| `Version`                | `int`      | —           | —                                                                                                                          |
| `SubmittedAt`            | `datetime` | —           | —                                                                                                                          |
| `DecidedAt`              | `datetime` | —           | —                                                                                                                          |
| `AppliedAt`              | `datetime` | —           | —                                                                                                                          |
| `FailureCode`            | `string`   | —           | —                                                                                                                          |
| `CreatedAt`              | `datetime` | —           | —                                                                                                                          |
| `CreatedByUserAccountId` | `int`      | FK          | —                                                                                                                          |
| `UpdatedAt`              | `datetime` | —           | —                                                                                                                          |

## AttendanceCorrectionItem

| Field                           | Type       | Constraints | Meaning                                                                           |
| ------------------------------- | ---------- | ----------- | --------------------------------------------------------------------------------- |
| `Id`                            | `int`      | PK          | —                                                                                 |
| `PublicId`                      | `uuid`     | UK          | —                                                                                 |
| `TenantId`                      | `int`      | FK          | —                                                                                 |
| `AttendanceCorrectionRequestId` | `int`      | FK          | —                                                                                 |
| `Operation`                     | `string`   | —           | AddEvent \| SupersedeEvent \| ExcludeEvent \| ChangeSchedule \| ReclassifySession |
| `AttendanceEventId`             | `int`      | FK          | —                                                                                 |
| `AttendanceSessionId`           | `int`      | FK          | —                                                                                 |
| `ProposedEventType`             | `string`   | —           | In \| Out \| BreakStart \| BreakEnd                                               |
| `ProposedOccurredAt`            | `datetime` | —           | —                                                                                 |
| `ProposedShiftVersionId`        | `int`      | FK          | —                                                                                 |
| `ProposedSessionType`           | `string`   | —           | Work \| Break                                                                     |
| `AppliedAttendanceEventId`      | `int`      | FK          | —                                                                                 |
| `SortOrder`                     | `int`      | —           | —                                                                                 |
| `CreatedAt`                     | `datetime` | —           | —                                                                                 |
| `CreatedBy`                     | `string`   | —           | —                                                                                 |

## AttendanceAdjustmentRequest

| Field                    | Type       | Constraints | Meaning                                                                                                        |
| ------------------------ | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `Id`                     | `int`      | PK          | —                                                                                                              |
| `PublicId`               | `uuid`     | UK          | —                                                                                                              |
| `TenantId`               | `int`      | FK          | —                                                                                                              |
| `RequestNumber`          | `string`   | UK          | —                                                                                                              |
| `AttendanceDayId`        | `int`      | FK          | —                                                                                                              |
| `EmploymentId`           | `int`      | FK          | —                                                                                                              |
| `Classification`         | `string`   | —           | CountedWork \| Absence \| Overtime \| ApprovedOvertime \| HolidayWork \| WeeklyRestWork                        |
| `MinutesDelta`           | `int`      | —           | —                                                                                                              |
| `ReasonCode`             | `string`   | —           | —                                                                                                              |
| `ReasonDetail`           | `string`   | —           | —                                                                                                              |
| `EvidenceDocumentId`     | `int`      | FK          | —                                                                                                              |
| `AppliedAttendanceDayId` | `int`      | FK          | —                                                                                                              |
| `Status`                 | `string`   | —           | Draft \| Submitted \| PendingApproval \| Approved \| Rejected \| Withdrawn \| Applied \| Failed \| Invalidated |
| `IdempotencyKey`         | `string`   | —           | —                                                                                                              |
| `Version`                | `int`      | —           | —                                                                                                              |
| `SubmittedAt`            | `datetime` | —           | —                                                                                                              |
| `DecidedAt`              | `datetime` | —           | —                                                                                                              |
| `AppliedAt`              | `datetime` | —           | —                                                                                                              |
| `FailureCode`            | `string`   | —           | —                                                                                                              |
| `CreatedAt`              | `datetime` | —           | —                                                                                                              |
| `CreatedByUserAccountId` | `int`      | FK          | —                                                                                                              |
| `UpdatedAt`              | `datetime` | —           | —                                                                                                              |

## AttendanceApprovalCase

| Field                           | Type       | Constraints | Meaning                                                                                     |
| ------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------- |
| `Id`                            | `int`      | PK          | —                                                                                           |
| `PublicId`                      | `uuid`     | UK          | —                                                                                           |
| `TenantId`                      | `int`      | FK          | —                                                                                           |
| `AttendanceCorrectionRequestId` | `int`      | FK          | —                                                                                           |
| `AttendanceAdjustmentRequestId` | `int`      | FK          | —                                                                                           |
| `AttendanceDayId`               | `int`      | FK          | —                                                                                           |
| `ShiftRosterId`                 | `int`      | FK          | —                                                                                           |
| `ScheduleOverrideId`            | `int`      | FK          | —                                                                                           |
| `AttendanceAnomalyId`           | `int`      | FK          | —                                                                                           |
| `AttendancePeriodId`            | `int`      | FK          | —                                                                                           |
| `AttendancePolicyVersionId`     | `int`      | FK          | —                                                                                           |
| `SubjectType`                   | `string`   | —           | Correction \| Adjustment \| Overtime \| Roster \| Override \| AnomalyWaiver \| PeriodReopen |
| `Status`                        | `string`   | —           | Pending \| Approved \| Rejected \| Cancelled \| Invalidated                                 |
| `CurrentStageNumber`            | `int`      | —           | —                                                                                           |
| `SubjectVersionAtOpen`          | `int`      | —           | —                                                                                           |
| `RoutingSnapshotJson`           | `string`   | —           | —                                                                                           |
| `OpenedAt`                      | `datetime` | —           | —                                                                                           |
| `DecidedAt`                     | `datetime` | —           | —                                                                                           |
| `InvalidatedAt`                 | `datetime` | —           | —                                                                                           |
| `InvalidationReason`            | `string`   | —           | —                                                                                           |
| `WorkflowPublicReference`       | `string`   | —           | —                                                                                           |
| `Version`                       | `int`      | —           | —                                                                                           |
| `CreatedAt`                     | `datetime` | —           | —                                                                                           |
| `UpdatedAt`                     | `datetime` | —           | —                                                                                           |

## AttendanceDecision

| Field                      | Type       | Constraints | Meaning              |
| -------------------------- | ---------- | ----------- | -------------------- |
| `Id`                       | `int`      | PK          | —                    |
| `PublicId`                 | `uuid`     | UK          | —                    |
| `TenantId`                 | `int`      | FK          | —                    |
| `AttendanceApprovalCaseId` | `int`      | FK          | —                    |
| `StageNumber`              | `int`      | —           | —                    |
| `ApprovalSlotCode`         | `string`   | —           | —                    |
| `DecidedByUserAccountId`   | `int`      | FK          | —                    |
| `Decision`                 | `string`   | —           | Approved \| Rejected |
| `AuthorityCode`            | `string`   | —           | —                    |
| `Reason`                   | `string`   | —           | —                    |
| `AssuranceLevel`           | `string`   | —           | —                    |
| `DecidedAt`                | `datetime` | —           | —                    |
| `CreatedAt`                | `datetime` | —           | —                    |

## WorkEvidence

| Field                    | Type       | Constraints | Meaning                                                        |
| ------------------------ | ---------- | ----------- | -------------------------------------------------------------- |
| `Id`                     | `int`      | PK          | —                                                              |
| `PublicId`               | `uuid`     | UK          | —                                                              |
| `TenantId`               | `int`      | FK          | —                                                              |
| `AttendanceDayId`        | `int`      | FK          | —                                                              |
| `AttendancePeriodLockId` | `int`      | FK          | —                                                              |
| `EmploymentId`           | `int`      | FK          | —                                                              |
| `WorkDate`               | `date`     | —           | —                                                              |
| `Purpose`                | `string`   | —           | CompOff \| Payroll \| TimesheetValidation                      |
| `EvidenceType`           | `string`   | —           | QualifyingWork \| ClassifiedMinutes \| Reversal                |
| `QualificationCondition` | `string`   | —           | HolidayWork \| WeeklyRestWork \| PolicyQualifiedWork           |
| `ExactMinutes`           | `int`      | —           | —                                                              |
| `ApprovedMinutes`        | `int`      | —           | —                                                              |
| `CalculationDigest`      | `string`   | —           | —                                                              |
| `ReversesWorkEvidenceId` | `int`      | FK          | —                                                              |
| `ConsumerStatus`         | `string`   | —           | Pending \| Published \| Acknowledged \| Rejected \| Superseded |
| `ConsumerReference`      | `string`   | —           | —                                                              |
| `IdempotencyKey`         | `string`   | —           | —                                                              |
| `AttemptCount`           | `int`      | —           | —                                                              |
| `PublishedAt`            | `datetime` | —           | —                                                              |
| `AcknowledgedAt`         | `datetime` | —           | —                                                              |
| `FailureCode`            | `string`   | —           | —                                                              |
| `CreatedAt`              | `datetime` | —           | —                                                              |
| `UpdatedAt`              | `datetime` | —           | —                                                              |

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.
