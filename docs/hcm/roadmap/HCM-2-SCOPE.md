# HCM-2 — Current Scope

HCM-2 is the Core Workforce delivery wave. It establishes the workforce and job-architecture models required by the first real employee-management applications. This document is current product authority for wave scope; source-code folder placement remains domain-first and does not mirror launchpad visual hierarchy.

## Domains and apps

### workforce-foundation

- `IDENTIFICATION_TYPES` — Identification Types
- `LOOKUP_VALUES` — Lookup Values
- `ORG_CHART` — Org Chart
- `ORGANIZATION_STRUCTURE` — Organization Structure (added by DEC-HCM2-014; enters the canonical catalogue through the [admission slice](HCM-2-DESIGN-REVIEW.md#catalogue-admission))

### job-architecture

- `JOB_CATALOGUE` — Job Catalogue
- `POSITIONS` — Positions
- `POSITION_REQUIREMENTS` — Position Requirements

### employee

- `EMPLOYEE_DIRECTORY` — Employee Directory
- `EMPLOYEE_IMPORT` — Employee Import
- `EMPLOYEE_PROFILE_CONFIGURATION` — Employee Profile Configuration
- `EMPLOYEE_RECORDS` — Employee Records
- `EMPLOYMENT_CHANGES` — Employment Changes
- `HR_SERVICE_DESK` — HR Service Desk
- `MY_HR_REQUESTS` — My HR Requests
- `MY_PROFILE` — My Profile
- `PROBATION_MANAGEMENT` — Probation Management
- `PROBATION_REVIEW` — Probation Review
- `TEAM_DIRECTORY` — Team Directory

## Required implementation order

1. Reconcile and finalize the current logical model for structural/workforce foundations.
2. Finalize the Job Architecture model and its integration with Assignment.
3. Finalize Employee profile/directory, record maintenance, import, change, probation and HR service models.
4. Resolve every decision marked **blocks HCM-2 implementation** in `HCM-2-DECISIONS.md`.
5. Finalize FDDs for all HCM-2 apps.
6. Finalize TDDs, including route, floorplan, contracts, SQL/RLS, Kysely, API and UI project impacts.
7. Run the app/wave readiness gates.
8. Only then implement, domain-by-domain and app-by-app.

## Non-negotiable v3 implementation rules

- SQL-first migrations own physical schema and RLS.
- Kysely is the typed query layer, not the schema authority.
- Existing foundation tables are evolved by additive/controlled migrations; do not create parallel duplicate workforce aggregates.
- Database rows are not API DTOs.
- HCM business screens use real APIs and real PostgreSQL data.
- Business features are theme-agnostic and use approved UI5/Fundamental controls/floorplans.
- Launchpad Space/Page placement never determines code ownership.
