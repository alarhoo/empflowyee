# HCM employee application

Employee ports (`hcm-api-employee-application`): `ProfileFieldVisibilityPort` with its
policy-backed implementation, `TeamScopeResolver` (DEC-HCM2-015) over the workforce read port, and
`EmployeePortBinder` for binding both to a caller transaction. See the
[HCM-2 port contract](../../../../../docs/hcm/tdd/TDD-HCM-2-COMMON.md#ports).
