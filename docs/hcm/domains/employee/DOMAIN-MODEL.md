# Employee — Domain Model

The Employee domain provides governed workforce profile and employee-record experiences over the authoritative Workforce Foundation facts. It does **not** create a duplicate Employee aggregate.

## Capabilities

### Profile and directory
- Product-owned field catalogue defines source field, sensitivity ceiling and default behavior.
- Tenant policy can narrow requiredness, visibility, edit mode and verification but cannot widen product privacy ceilings.
- Worker visibility preferences may narrow/opt-in where allowed; they are not authorization grants.
- Tenant custom fields attach to exactly one owner scope: Person, Worker, Employment or Assignment.
- Directory and team views are read projections filtered by permission/scope and field policy.

### Employee records
- Record screens assemble Workforce Foundation facts plus entitled domain data.
- Direct editing of effective employment/assignment facts is forbidden after activation; changes use typed commands.

### Import
- Import template is versioned and maps source columns to approved standard/custom fields.
- Validation/preview is side-effect free.
- Import rows hold safe staging/match/result metadata rather than unrestricted raw source rows.
- Commit is idempotent and may create invitations only after workforce facts are committed.

### Employment changes
- Transfer, promotion, demotion, location, manager, hours, employment type, suspension, return-to-work, rehire and correction are explicit effective-dated requests.
- Approval evidence is separate from execution evidence.
- Execution changes the Workforce Foundation dated facts without overlap.

### Probation
- Review, manager/reviewer assessment and HR decision are distinct records.
- Confirm/Extend/Fail/NoChange does not itself terminate employment or replace performance management.

### HR service desk
- Employee-facing request content and internal HR content are deliberately separated.
- Team membership is routing/workload configuration, not access authorization.
- SLA clocks are policy/calendar driven.

## HCM-2 applications

- `EMPLOYEE_DIRECTORY`
- `EMPLOYEE_IMPORT`
- `EMPLOYEE_PROFILE_CONFIGURATION`
- `EMPLOYEE_RECORDS`
- `EMPLOYMENT_CHANGES`
- `HR_SERVICE_DESK`
- `MY_HR_REQUESTS`
- `MY_PROFILE`
- `PROBATION_MANAGEMENT`
- `PROBATION_REVIEW`
- `TEAM_DIRECTORY`
