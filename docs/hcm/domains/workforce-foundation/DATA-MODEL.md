# Workforce Foundation — Logical Data Model

This is the current logical entity catalogue for HCM-2 workforce foundations. It describes domain facts, not final PostgreSQL DDL. Physical names, SQL types, indexes and migration sequencing are finalized in the HCM-2 TDD while preserving these semantics and the existing database spine.

## Organization

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `string` | UK | Opaque UUID used by tenant APIs and routes |
| `TenantId` | `int` | FK | References Tenant(Id); unique while the model is one Organization per Tenant |
| `Code` | `string` | UK | Stable internal reference used in imports and integrations |
| `Name` | `string` | — | Trading name shown throughout the product |
| `LegalName` | `string` | — | Full registered name; may differ from the trading name |
| `Description` | `string` | — | — |
| `IndustryTypeId` | `int` | FK | References IndustryType(Id) |
| `Website` | `string` | — | — |
| `EmployeeCountEstimate` | `int` | — | Carried from signup. Real headcount is derived from employment records, never stored here |
| `FoundedOnDate` | `date` | — | — |
| `HeadquartersLocationId` | `int` | FK | References Location(Id); replaces free-text address so the HQ is a real, reusable place |
| `DefaultCurrencyId` | `int` | FK | References Currency(Id); default for new legal entities and pay structures |
| `DefaultTimeZone` | `string` | — | IANA identifier, e.g. 'Asia/Kolkata'. Not a lookup: the IANA database is the authority |
| `DefaultLanguageCode` | `string` | — | BCP 47, e.g. 'en-IN' |
| `FinancialYearStartMonth` | `int` | — | 1-12; 4 in India. Stored separately because a recurring month-day has no meaningful year |
| `FinancialYearStartDay` | `int` | — | 1-31 and valid for the selected month; 1 in India |
| `PrimaryContactName` | `string` | — | Business owner of the account, distinct from the billing or technical contact |
| `PrimaryContactEmail` | `string` | — | — |
| `PrimaryContactPhone` | `string` | — | — |
| `IsActive` | `boolean` | — | — |
| `Version` | `int` | — | Optimistic tenant API version |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## LegalEntity

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `string` | UK | Opaque UUID used by tenant APIs and routes |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) |
| `Code` | `string` | UK | — |
| `Name` | `string` | — | — |
| `RegisteredName` | `string` | — | Exact name on the incorporation certificate |
| `EntityType` | `string` | — | PrivateLimited \| PublicLimited \| LimitedLiabilityPartnership \| Partnership \| SoleProprietorship \| Branch \| Other |
| `CountryId` | `int` | FK | References Country(Id); determines which statutory identifiers apply |
| `RegistrationNumber` | `string` | — | Company registration, e.g. CIN in India |
| `TaxIdentificationNumber` | `string` | — | Primary tax id, e.g. PAN in India |
| `TaxDeductionAccountNumber` | `string` | — | Withholding-tax account, e.g. TAN in India |
| `SocialSecurityEmployerCode` | `string` | — | e.g. EPFO establishment code in India |
| `StateInsuranceEmployerCode` | `string` | — | e.g. ESIC code in India |
| `RegisteredLocationId` | `int` | FK | References Location(Id); the address on statutory filings |
| `ReportingCurrencyId` | `int` | FK | References Currency(Id) |
| `FinancialYearStartMonth` | `int` | — | 1-12; may differ from the organization default for a foreign subsidiary |
| `FinancialYearStartDay` | `int` | — | 1-31 and valid for the selected month |
| `IncorporatedOnDate` | `date` | — | — |
| `OperationsStartedOnDate` | `date` | — | — |
| `OperationsClosedOnDate` | `date` | — | Null while trading; set rather than deleting, because payroll history must survive |
| `IsActive` | `boolean` | — | — |
| `Version` | `int` | — | Optimistic tenant API version |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## GoodsAndServicesTaxRegistration

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `string` | UK | Opaque UUID used by tenant APIs and routes |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `LegalEntityId` | `int` | FK | References LegalEntity(Id) |
| `StateOrTerritoryCode` | `string` | — | India GST state/territory code, e.g. '29' for Karnataka |
| `RegistrationNumber` | `string` | — | GSTIN exactly as issued; globally unique while active |
| `RegistrationType` | `string` | — | Regular \| Composition \| CasualTaxablePerson \| NonResidentTaxablePerson \| InputServiceDistributor \| Other |
| `RegisteredLocationId` | `int` | FK | References Location(Id); principal place for this registration |
| `EffectiveFromDate` | `date` | — | — |
| `EffectiveToDate` | `date` | — | Null while current; periods for the same entity/state/type cannot overlap |
| `IsActive` | `boolean` | — | May this registration be selected for new transactions |
| `Version` | `int` | — | Optimistic tenant API version |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## OrgUnitType

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `string` | UK | Opaque UUID used by tenant APIs and routes |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) |
| `Code` | `string` | — | Stable across renames, e.g. 'BUSINESS_UNIT' |
| `Name` | `string` | — | What this customer calls the level, e.g. 'Business Unit', 'Practice', 'Plant' |
| `PluralName` | `string` | — | For list headings and empty states |
| `ParentOrgUnitTypeId` | `int` | FK | Self-reference; null for the root level. Defines the permitted nesting order |
| `HierarchyLevel` | `int` | — | 1-based depth, derived from the parent chain; stored to make level queries cheap |
| `Icon` | `string` | — | — |
| `IsEnabled` | `boolean` | — | Disabled levels are hidden from navigation but their historical units are preserved |
| `AllowMultiplePerParent` | `boolean` | — | False for a level like Company where only one child is meaningful |
| `IsLegalEntityBearing` | `boolean` | — | True when units at this level map to a LegalEntity, e.g. Company |
| `SortOrder` | `int` | — | — |
| `Version` | `int` | — | Optimistic tenant API version |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## OrgUnit

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `string` | UK | Opaque UUID used by tenant APIs and routes; remains stable across versions |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) |
| `Code` | `string` | — | Unique within the organization; used in imports and integrations |
| `SupersededByOrgUnitId` | `int` | FK | Self-reference; where this unit's identity moved on a merger, not an ordinary reparenting |
| `IsActive` | `boolean` | — | May this stable unit receive new references |
| `Version` | `int` | — | Optimistic tenant API version |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## OrgUnitVersion

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) |
| `OrgUnitId` | `int` | FK | References OrgUnit(Id); versions cannot overlap for one unit |
| `OrgUnitTypeId` | `int` | FK | References OrgUnitType(Id); fixes the level for this effective period |
| `ParentOrgUnitId` | `int` | FK | References OrgUnit(Id); null only for the effective root. Parent type must match the configured type chain |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `LegalEntityId` | `int` | FK | References LegalEntity(Id); set on legal-entity-bearing levels, inherited from the ancestor otherwise |
| `PrimaryLocationId` | `int` | FK | References Location(Id); where this unit is principally based |
| `CostCenterCode` | `string` | — | Finance's code for this unit; the bridge to the accounting system |
| `HeadWorkerId` | `int` | FK | References Worker(Id) — workforce foundation. Deliberately not Assignment: the head keeps heading the unit through their own promotion |
| `MaterializedPath` | `string` | — | Slash-delimited ancestor ids, e.g. '/1/4/9/'. Denormalized to make subtree reads a prefix scan |
| `Depth` | `int` | — | Denormalized depth, kept consistent with MaterializedPath |
| `EffectiveFromDate` | `date` | — | — |
| `EffectiveToDate` | `date` | — | Null while current; periods for one OrgUnit cannot overlap |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## Location

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `string` | UK | Opaque UUID used by tenant APIs and routes |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) |
| `Code` | `string` | UK | e.g. 'BLR-01' |
| `Name` | `string` | — | e.g. 'Bangalore — Whitefield' |
| `LocationType` | `string` | — | HeadOffice \| BranchOffice \| RegisteredOffice \| Factory \| Warehouse \| ClientSite \| Remote |
| `AddressLine1` | `string` | — | — |
| `AddressLine2` | `string` | — | — |
| `Locality` | `string` | — | Neighbourhood or area |
| `City` | `string` | — | — |
| `StateOrProvince` | `string` | — | — |
| `PostalCode` | `string` | — | — |
| `CountryId` | `int` | FK | References Country(Id) |
| `Latitude` | `decimal` | — | For geofenced attendance; null when the site is virtual |
| `Longitude` | `decimal` | — | — |
| `GeofenceRadiusMeters` | `int` | — | — |
| `TimeZone` | `string` | — | IANA identifier; overrides the organization default for this site |
| `ContactPhone` | `string` | — | — |
| `ContactEmail` | `string` | — | — |
| `IsVirtual` | `boolean` | — | True for a 'Remote' location that has no physical address |
| `IsActive` | `boolean` | — | — |
| `Version` | `int` | — | Optimistic tenant API version |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## Department

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `string` | UK | Opaque UUID used by tenant APIs and routes |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) |
| `Code` | `string` | UK | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `ParentDepartmentId` | `int` | FK | Self-reference for sub-departments |
| `HeadWorkerId` | `int` | FK | References Worker(Id) - workforce foundation |
| `CostCenterCode` | `string` | — | — |
| `TargetHeadcount` | `int` | — | Planned size, used against actual headcount for workforce planning |
| `IsActive` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `Version` | `int` | — | Optimistic tenant API version |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## Designation

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `PublicId` | `string` | UK | Opaque UUID used by tenant APIs and routes |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) |
| `Code` | `string` | UK | — |
| `Name` | `string` | — | — |
| `Description` | `string` | — | — |
| `ParentDesignationId` | `int` | FK | Self-reference; expresses the customary progression, not a reporting line |
| `SortOrder` | `int` | — | Seniority order for display; not a numeric grade |
| `IsActive` | `boolean` | — | — |
| `Version` | `int` | — | Optimistic tenant API version |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## Country

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `IsoAlpha2Code` | `string` | UK | ISO 3166-1 alpha-2, e.g. 'IN' |
| `IsoAlpha3Code` | `string` | UK | ISO 3166-1 alpha-3, e.g. 'IND' |
| `Name` | `string` | — | — |
| `DialingCode` | `string` | — | e.g. '+91' |
| `DefaultCurrencyId` | `int` | FK | References Currency(Id) |
| `DefaultTimeZone` | `string` | — | IANA identifier; only meaningful for single-timezone countries |
| `IsSupported` | `boolean` | — | False for countries the product does not yet handle statutorily |
| `SortOrder` | `int` | — | — |

## Currency

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `IsoCode` | `string` | UK | ISO 4217, e.g. 'INR' |
| `Name` | `string` | — | e.g. 'Indian Rupee' |
| `Symbol` | `string` | — | e.g. '₹' |
| `MinorUnitDigits` | `int` | — | Decimal places; 2 for INR, 0 for JPY. Required for correct rounding in payroll |
| `IsActive` | `boolean` | — | — |

## IndustryType

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `Code` | `string` | UK | e.g. 'IT_SERVICES' |
| `Name` | `string` | — | e.g. 'IT Services', 'Manufacturing', 'Healthcare' |
| `Description` | `string` | — | — |
| `ParentIndustryTypeId` | `int` | FK | Self-reference for sector then sub-sector |
| `SortOrder` | `int` | — | — |
| `IsActive` | `boolean` | — | — |

## Person

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) — organization foundation |
| `PublicId` | `string` | UK | Opaque stable API and route identifier |
| `FirstName` | `string` | — | SENSITIVE |
| `MiddleName` | `string` | — | SENSITIVE |
| `LastName` | `string` | — | SENSITIVE |
| `PreferredName` | `string` | — | What the person asks to be called. Shown in the UI in preference to FirstName |
| `FormerName` | `string` | — | Retained because pre-change payroll and statutory records carry it |
| `SearchDigest` | `string` | — | Derived non-display name search projection; contains no identifier plaintext |
| `BirthDate` | `date` | — | SENSITIVE. Drives retirement eligibility, statutory minors, insurance premiums |
| `GenderId` | `int` | FK | References Gender(Id) |
| `MaritalStatusId` | `int` | FK | References MaritalStatus(Id). Affects tax declarations and insurance dependants |
| `NationalityCountryCode` | `string` | — | ISO 3166-1 alpha-2. Drives visa and work-authorization requirements |
| `BloodGroup` | `string` | — | SENSITIVE. Held for emergency response only; optional and employee-supplied |
| `PhotoUrl` | `string` | — | — |
| `DeceasedOnDate` | `date` | — | Set rather than deleting. Triggers nominee settlement and stops all notifications |
| `IsActive` | `boolean` | — | False only for a record merged into another. Leaving the company does not deactivate a Person |
| `MergedIntoPersonId` | `int` | FK | Self-reference. Set when this record was found to be a duplicate; reads follow the chain |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## PersonAddress

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `PersonId` | `int` | FK | References Person(Id) |
| `AddressType` | `string` | — | Permanent \| Current \| Correspondence \| Emergency |
| `AddressLine1` | `string` | — | SENSITIVE |
| `AddressLine2` | `string` | — | SENSITIVE |
| `Locality` | `string` | — | — |
| `City` | `string` | — | — |
| `StateOrProvince` | `string` | — | — |
| `PostalCode` | `string` | — | — |
| `CountryId` | `int` | FK | References Country(Id) — organization foundation |
| `IsPrimary` | `boolean` | — | At most one primary per person |
| `EffectiveFromDate` | `date` | — | Addresses change; payroll and statutory filings reference the address as at a date |
| `EffectiveToDate` | `date` | — | NULL means current |
| `EffectivePeriod` | `string` | — | Derived half-open interval used to enforce dated overlap rules |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## PersonContactPoint

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `PersonId` | `int` | FK | References Person(Id) |
| `ContactPointType` | `string` | — | PersonalEmail \| MobilePhone \| HomePhone \| EmergencyPhone |
| `Value` | `string` | — | SENSITIVE |
| `IsPrimary` | `boolean` | — | At most one primary per type per person |
| `IsVerified` | `boolean` | — | Personal email and mobile are verified before they can receive payslips or reset links |
| `VerifiedAt` | `datetime` | — | — |
| `IsActive` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## PersonIdentification

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `PersonId` | `int` | FK | References Person(Id) |
| `IdentificationTypeId` | `int` | FK | References IdentificationType(Id) |
| `MaskedValue` | `string` | — | SENSITIVE. Display form, e.g. 'XXXX XXXX 1234'. Safe for lists and exports |
| `EncryptedValue` | `string` | — | SENSITIVE. Full value, encrypted at rest. Never logged, never in an export |
| `ValueHash` | `string` | — | Deterministic hash, for duplicate detection without decrypting |
| `IssuingAuthority` | `string` | — | — |
| `IssuingCountryCode` | `string` | — | ISO 3166-1 alpha-2 |
| `IssuedOnDate` | `date` | — | — |
| `ExpiresOnDate` | `date` | — | Visas and passports expire; drives renewal reminders and work-authorization checks |
| `IsVerified` | `boolean` | — | — |
| `VerifiedByUserAccountId` | `int` | FK | References UserAccount(Id) |
| `VerifiedAt` | `datetime` | — | — |
| `IsActive` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## PersonRelationship

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `PersonId` | `int` | FK | References Person(Id) |
| `RelationshipTypeId` | `int` | FK | References RelationshipType(Id) |
| `RelatedPersonId` | `int` | FK | References Person(Id). Set only when the relative is also in the system |
| `FullName` | `string` | — | SENSITIVE. Used when RelatedPersonId is null |
| `BirthDate` | `date` | — | SENSITIVE. Insurance premiums and child-related benefits depend on age |
| `GenderId` | `int` | FK | References Gender(Id) |
| `ContactNumber` | `string` | — | SENSITIVE |
| `IsDependent` | `boolean` | — | Eligible under the employee's insurance or benefit cover |
| `IsEmergencyContact` | `boolean` | — | — |
| `EmergencyContactPriority` | `int` | — | 1 is called first. Unique per person among emergency contacts |
| `IsStatutoryNominee` | `boolean` | — | Provident fund and gratuity nomination. Legally distinct from being a dependant |
| `NominationSharePercentage` | `decimal` | — | Nominees may split an entitlement; must total 100 across active nominees |
| `IsActive` | `boolean` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## Worker

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `PublicId` | `string` | UK | Opaque stable API and route identifier |
| `OrganizationId` | `int` | FK | References Organization(Id) — organization foundation |
| `PersonId` | `int` | FK | References Person(Id). Unique per organization |
| `WorkerNumber` | `string` | — | Staff number shown everywhere, e.g. 'EMP-0042'. Format and sequence come from OrganizationPolicy — organization foundation |
| `WorkerTypeId` | `int` | FK | References WorkerType(Id) |
| `FirstEngagementStartDate` | `date` | — | Earliest Employment start. Denormalized: 'length of association' is asked constantly and spans employments |
| `LatestEngagementEndDate` | `date` | — | NULL while currently engaged |
| `IsCurrentlyEngaged` | `boolean` | — | Derived: true when an Employment is open. Stored because every roster, directory and report filters on it |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## Employment

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `PublicId` | `string` | UK | Opaque stable API and route identifier |
| `WorkerId` | `int` | FK | References Worker(Id) |
| `LegalEntityId` | `int` | FK | References LegalEntity(Id) — organization foundation |
| `WorkEmail` | `string` | — | Employer-issued address for this legal-employer engagement; concurrent employments may differ |
| `EmploymentSequence` | `int` | — | 1 for the first engagement, 2 for the first rehire. Makes 'her second stint' expressible |
| `EmploymentType` | `string` | — | Permanent \| FixedTerm \| Contract \| Internship \| Apprenticeship \| Consultant |
| `HireDate` | `date` | — | First working day. Distinct from the offer date and the contract date |
| `ContinuousServiceStartDate` | `date` | — | Usually equals HireDate. Differs after an acquisition or an approved break where prior service is honoured — gratuity depends on it |
| `ProbationEndDate` | `date` | — | — |
| `ProbationStatus` | `string` | — | NotApplicable \| InProgress \| Confirmed \| Extended \| Failed |
| `ConfirmedOnDate` | `date` | — | — |
| `NoticePeriodDays` | `int` | — | Contractual notice. May be overridden per exit |
| `ResignationSubmittedOnDate` | `date` | — | When the worker gave notice. NULL for employer-initiated exits |
| `LastWorkingDate` | `date` | — | Final day physically at work |
| `EmploymentEndDate` | `date` | — | Effective end of the engagement. May exceed LastWorkingDate where notice is paid in lieu |
| `EmploymentEndReasonId` | `int` | FK | References EmploymentEndReason(Id) |
| `IsEligibleForRehire` | `boolean` | — | Set at exit. Read before a candidate is progressed |
| `RehireEligibilityNote` | `string` | — | — |
| `EmploymentStatus` | `string` | — | Pending \| Active \| OnNotice \| Suspended \| Ended. Pending covers an accepted offer before day one |
| `IsPrimaryEmployment` | `boolean` | — | False for a genuine concurrent engagement with a second group entity |
| `EmploymentPeriod` | `string` | — | Derived inclusive interval used to enforce employment overlap rules |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## Assignment

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `PublicId` | `string` | UK | Opaque stable API and route identifier |
| `EmploymentId` | `int` | FK | References Employment(Id) |
| `OrgUnitId` | `int` | FK | References OrgUnit(Id) — organization foundation |
| `DepartmentId` | `int` | FK | References Department(Id) — organization foundation |
| `DesignationId` | `int` | FK | References Designation(Id) — organization foundation |
| `WorkLocationId` | `int` | FK | References Location(Id) — organization foundation. Where the work is based |
| `WorkMode` | `string` | — | OnSite \| Remote \| Hybrid. Drives attendance rules and geofencing |
| `FullTimeEquivalent` | `decimal` | — | 1.0 for full time, 0.5 for half. Headcount reports sum this, not row count |
| `StandardHoursPerWeek` | `decimal` | — | — |
| `IsPrimaryAssignment` | `boolean` | — | Exactly one primary per employment per date |
| `IsBillable` | `boolean` | — | Client-billable. Meaningful in a services business; the basis of utilization |
| `CostCenterCode` | `string` | — | Overrides the org unit's cost centre where a person is charged elsewhere |
| `EffectiveFromDate` | `date` | — | — |
| `EffectiveToDate` | `date` | — | NULL means current |
| `EffectivePeriod` | `string` | — | Derived half-open interval used to enforce dated overlap rules |
| `SupersededByAssignmentId` | `int` | FK | Self-reference. Links a closed row to the one that replaced it, giving a clean chain |
| `ChangeNote` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## ReportingLine

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `AssignmentId` | `int` | FK | References Assignment(Id). The reporting assignment |
| `ManagerAssignmentId` | `int` | FK | References Assignment(Id). Whom they report to. An assignment, not a worker, so the line survives the manager's own transfer correctly |
| `ReportingLineType` | `string` | — | Solid \| Dotted \| Temporary \| Administrative |
| `IsPrimary` | `boolean` | — | Exactly one primary solid line per assignment per date. The default approver and the org-chart edge |
| `EffectiveFromDate` | `date` | — | — |
| `EffectiveToDate` | `date` | — | NULL means current |
| `EffectivePeriod` | `string` | — | Derived half-open interval used to enforce dated overlap rules |
| `DelegatedFromReportingLineId` | `int` | FK | Self-reference. Set on a Temporary line covering another line's absence |
| `Reason` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## WorkerEvent

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `WorkerId` | `int` | FK | References Worker(Id) |
| `EmploymentId` | `int` | FK | References Employment(Id). NULL only for events before any engagement exists |
| `AssignmentId` | `int` | FK | References Assignment(Id). Set when the event created or closed an assignment |
| `WorkerEventTypeId` | `int` | FK | References WorkerEventType(Id) |
| `EffectiveDate` | `date` | — | When the change took effect, which is often not when it was recorded |
| `RecordedAt` | `datetime` | — | When the system was told. Backdated entries make the gap visible |
| `Reason` | `string` | — | Free text supplementing the event type |
| `ApprovedByUserAccountId` | `int` | FK | References UserAccount(Id) |
| `ApprovedOnDate` | `date` | — | — |
| `PreviousValueSummary` | `string` | — | Human-readable snapshot of what changed, for the timeline view. Not a substitute for the dated rows themselves |
| `NewValueSummary` | `string` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |

## WorkerType

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) — organization foundation |
| `Code` | `string` | UK | Unique per organization |
| `Name` | `string` | — | The customer's own term, e.g. 'Associate', 'Retainer', 'Trainee' |
| `Description` | `string` | — | — |
| `StatutoryClass` | `string` | — | Employee \| Contractor \| Apprentice \| Intern \| Consultant. Product-owned; drives statutory treatment |
| `IsPayrollEligible` | `boolean` | — | — |
| `IsBenefitEligible` | `boolean` | — | — |
| `IsActive` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## EmploymentEndReason

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) — organization foundation |
| `Code` | `string` | UK | Unique per organization |
| `Name` | `string` | — | e.g. 'Better Opportunity', 'Higher Studies', 'Performance', 'Redundancy' |
| `Description` | `string` | — | — |
| `IsVoluntary` | `boolean` | — | Worker-initiated |
| `IsRegrettable` | `boolean` | — | Manager's judgement, set per exit rather than by the reason alone |
| `IsEligibleForRehireByDefault` | `boolean` | — | A default the exit process may override |
| `IsActive` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## WorkerEventType

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `TenantId` | `int` | FK | References Tenant(Id) |
| `OrganizationId` | `int` | FK | References Organization(Id) — organization foundation |
| `Code` | `string` | UK | Unique per organization |
| `Name` | `string` | — | e.g. 'Hired', 'Confirmed', 'Promoted', 'Transferred', 'Resigned', 'Terminated', 'Rehired' |
| `Description` | `string` | — | — |
| `Category` | `string` | — | Hire \| Confirm \| Promote \| Transfer \| Demote \| CompensationChange \| Leave \| Suspend \| Exit \| Rehire \| Other |
| `RequiresApproval` | `boolean` | — | — |
| `IsActive` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `CreatedAt` | `datetime` | — | — |
| `CreatedBy` | `string` | — | — |
| `UpdatedAt` | `datetime` | — | — |
| `UpdatedBy` | `string` | — | — |

## Gender

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `Code` | `string` | UK | e.g. 'FEMALE', 'MALE', 'TRANSGENDER', 'NOT_DISCLOSED' |
| `Name` | `string` | — | — |
| `StatutoryClass` | `string` | — | Female \| Male \| Other \| NotDisclosed. What statutory reports must submit |
| `SortOrder` | `int` | — | — |
| `IsActive` | `boolean` | — | — |

## MaritalStatus

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `Code` | `string` | UK | e.g. 'SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED' |
| `Name` | `string` | — | — |
| `SortOrder` | `int` | — | — |
| `IsActive` | `boolean` | — | — |

## IdentificationType

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `Code` | `string` | UK | e.g. 'PAN', 'AADHAAR', 'PASSPORT', 'DRIVING_LICENCE', 'UAN' |
| `Name` | `string` | — | Spelled out per the naming conventions; the local abbreviation lives in the glossary |
| `CountryId` | `int` | FK | References Country(Id) — organization foundation. NULL means valid in every country, e.g. Passport |
| `ValidationPattern` | `string` | — | Regular expression, e.g. PAN is five letters, four digits, one letter |
| `IsUniquePerPerson` | `boolean` | — | A person has one PAN but may hold several passports over time |
| `RequiresMasking` | `boolean` | — | True for Aadhaar and equivalents, where the full value must not reach a screen |
| `IsRequiredForPayroll` | `boolean` | — | Blocks payroll setup when missing |
| `SortOrder` | `int` | — | — |
| `IsActive` | `boolean` | — | — |

## RelationshipType

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `Id` | `int` | PK | — |
| `Code` | `string` | UK | e.g. 'SPOUSE', 'FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'GUARDIAN', 'FRIEND' |
| `Name` | `string` | — | — |
| `InverseCode` | `string` | — | The reciprocal, e.g. SON inverts to FATHER or MOTHER. Lets a two-way link be created once |
| `IsFamilyRelation` | `boolean` | — | — |
| `IsEligibleAsDependent` | `boolean` | — | Insurance cover typically extends to spouse, children and parents, not to siblings |
| `IsEligibleAsNominee` | `boolean` | — | — |
| `SortOrder` | `int` | — | — |
| `IsActive` | `boolean` | — | — |
