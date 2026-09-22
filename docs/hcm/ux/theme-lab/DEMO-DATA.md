# Demo data model

Use deterministic fixtures only. No backend dependency is required for the first milestone.

## Employee fixture

Minimum fields:
- employeeId
- firstName / lastName / preferredName
- avatarUrl placeholder/local asset
- workEmail
- phone
- dateOfBirth
- employmentStatus
- employmentType
- position
- department
- manager
- workLocation
- joinDate
- skills[]
- leaveBalances[]
- leaveRequests[]
- employmentHistory[]
- documents[]
- projectAssignments[]

Suggested fixture names:
- Michael Scott
- Jim Halpert
- Pam Beesly
- Dwight Schrute
- Angela Martin
- Kevin Malone
- Oscar Martinez
- Toby Flenderson

Use fictional addresses/domains/IDs.

## Leave fixture
- requestId
- employeeId
- leaveType
- startDate
- endDate
- duration
- status
- approver
- comments
- timeline[]

## Project fixture
- projectId
- name
- client
- status
- progress
- startDate
- targetDate
- members[]
- assignments[]

## Interaction expectations
- selecting an employee updates the FCL mid column
- selecting a leave request/document/project assignment can open the FCL end column
- demo edits are local state only and reset on reload/reset

## Implemented fixture mapping

`lab-data.ts` owns eight fictional employees, three leave requests and three projects. `LabEmployee.id/name/email/status/location/joined` are the implementation names for employeeId, display name, workEmail, employmentStatus, workLocation and joinDate. First/last/preferred names are explicit. Avatars use native initials instead of external photo URLs.

Each employee has skills, annual/personal balances, filtered leave requests, employment history, filenames and project assignments derived from actual fixture membership. IDs use `DEMO-`, `LV-` and `PR-`; email addresses use `.example`. The profile never assigns every employee the same unrelated request or project.

Approval timelines and assignment allocations are local presentation scenarios, not an approval engine or scheduling model. The Leave request editor produces a disposable contextual summary. Employee edit drafts reset on employee selection/reload; filenames never imply that file bytes exist on a server. No fixture is tenant/customer data.
