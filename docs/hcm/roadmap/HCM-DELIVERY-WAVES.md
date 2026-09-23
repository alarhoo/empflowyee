# HCM delivery waves

| Wave  | Delivery scope                                                                                                                                      | Primary domains                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| HCM-0 | AI Engineering Factory, canonical catalogue, launchpad, DB/migration/tooling foundation                                                             | platform foundation                                                                    |
| HCM-1 | Platform spine: access, identity/session plumbing, notifications, documents, audit, workflow foundation, entitlement projection, minimal governance | access-control, identity-access, notifications, documents, audit, workflow, governance |
| HCM-2 | Workforce & organisation                                                                                                                            | workforce-foundation, employee, job-architecture                                       |
| HCM-3 | Leave, attendance, schedules, approvals                                                                                                             | leave, attendance, workflow                                                            |
| HCM-4 | Projects, utilization, timesheets                                                                                                                   | projects, timesheet                                                                    |
| HCM-5 | Recruitment, onboarding, offboarding/alumni                                                                                                         | recruitment, onboarding, offboarding                                                   |
| HCM-6 | Compensation, benefits, payroll, expenses                                                                                                           | compensation-benefits, payroll, expenses                                               |
| HCM-7 | Skills, learning, goals/performance/PIP                                                                                                             | skills, learning, performance                                                          |
| HCM-8 | Assets, policy/compliance/privacy, engagement/wellbeing                                                                                             | assets, governance, engagement                                                         |
| HCM-9 | Analytics, reporting, cross-domain read models                                                                                                      | analytics                                                                              |

## Wave readiness rule

Before implementation of a wave begins:

- every app in that wave has an approved FDD;
- every app in that wave has an approved TDD;
- every `BLOCKS_THIS_APP` decision is resolved;
- shared/domain contracts required by the wave are approved;
- cross-wave prerequisites are explicitly listed.

We keep high-level ownership/catalogue metadata for all apps, then finalize detailed FDD/TDD wave-by-wave to avoid a giant stale waterfall.

### Approved HCM-1 local-stage exception

On 2026-09-24 the product owner approved the 20-app local stage defined by the
Local rows in [HCM-1 local delivery](HCM-1-LOCAL-DELIVERY.md#proposed-app-coverage).
See DEC-HCM1-001 and its explicit approval evidence in the
[decision register](HCM-1-DECISIONS.md).

Before implementation of that stage begins, all 20 local apps require approved
FDDs, TDDs and blueprints, resolved current blockers, approved shared/domain
contracts and listed cross-wave prerequisites. Implement admitted apps in small
slices after this stage-wide review. This exception changes the scope of the
design gate, not the evidence required for an app.

Active Sessions, API Credentials, Security Policies, SSO Configuration, Email
Sender Configuration and Outbound Webhooks remain Planned in HCM-1. Their designs
do not block the approved local stage, but still block those apps and full HCM-1
completion. Production authentication and external integrations are deferred.
The full-wave readiness command retains all 26 apps and must not report the wave
ready merely because the local stage is complete. Other waves retain the rule above.
