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
