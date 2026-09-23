# Planned HCM codebase map

> Generated from `docs/hcm/catalogue/hcm-app-catalogue.json`.
>
> Directory presence does not mean an Nx project exists. Nx projects are generated only when an approved implementation requires them.

```text
libs/hcm/
├── web/
│   ├── shell/
│   ├── runtime/
│   ├── navigation/
│   ├── ux/
│   ├── access-control/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-access-assignments/    # ACCESS_ASSIGNMENTS
│   │   └── feature-app-catalogue-configuration/    # APP_CATALOGUE_CONFIGURATION
│   │   └── feature-role-management/    # ROLE_MANAGEMENT
│   │   └── feature-tenant-access-reviews/    # TENANT_ACCESS_REVIEWS
│   ├── analytics/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-asset-utilization/    # ASSET_UTILIZATION
│   │   └── feature-attendance-report/    # ATTENDANCE_REPORT
│   │   └── feature-attrition-dashboard/    # ATTRITION_DASHBOARD
│   │   └── feature-benefits-cost-analysis/    # BENEFITS_COST_ANALYSIS
│   │   └── feature-compensation-analysis/    # COMPENSATION_ANALYSIS
│   │   └── feature-compliance-dashboard/    # COMPLIANCE_DASHBOARD
│   │   └── feature-expense-analysis/    # EXPENSE_ANALYSIS
│   │   └── feature-headcount-analysis/    # HEADCOUNT_ANALYSIS
│   │   └── feature-hiring-funnel/    # HIRING_FUNNEL
│   │   └── feature-hr-analytics/    # HR_ANALYTICS
│   │   └── feature-leave-trends/    # LEAVE_TRENDS
│   │   └── feature-onboarding-metrics/    # ONBOARDING_METRICS
│   │   └── feature-payroll-summary/    # PAYROLL_SUMMARY
│   │   └── feature-performance-insights/    # PERFORMANCE_INSIGHTS
│   │   └── feature-project-utilization/    # PROJECT_UTILIZATION
│   │   └── feature-report-builder/    # REPORT_BUILDER
│   │   └── feature-skill-gap-report/    # SKILL_GAP_REPORT
│   │   └── feature-timesheet-compliance/    # TIMESHEET_COMPLIANCE
│   │   └── feature-training-effectiveness/    # TRAINING_EFFECTIVENESS
│   ├── assets/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-asset-administration/    # ASSET_ADMINISTRATION
│   │   └── feature-asset-categories/    # ASSET_CATEGORIES
│   │   └── feature-asset-maintenance/    # ASSET_MAINTENANCE
│   │   └── feature-my-assets/    # MY_ASSETS
│   ├── attendance/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-approve-attendance/    # APPROVE_ATTENDANCE
│   │   └── feature-attendance-corrections/    # ATTENDANCE_CORRECTIONS
│   │   └── feature-attendance-management/    # ATTENDANCE_MANAGEMENT
│   │   └── feature-holiday-calendars/    # HOLIDAY_CALENDARS
│   │   └── feature-my-attendance/    # MY_ATTENDANCE
│   │   └── feature-my-schedule/    # MY_SCHEDULE
│   │   └── feature-shift-planning/    # SHIFT_PLANNING
│   │   └── feature-team-attendance/    # TEAM_ATTENDANCE
│   │   └── feature-work-schedule-templates/    # WORK_SCHEDULE_TEMPLATES
│   │   └── feature-work-schedules/    # WORK_SCHEDULES
│   ├── audit/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-audit-log/    # AUDIT_LOG
│   │   └── feature-data-export-log/    # DATA_EXPORT_LOG
│   │   └── feature-my-activity/    # MY_ACTIVITY
│   │   └── feature-sensitive-access-log/    # SENSITIVE_ACCESS_LOG
│   ├── compensation-benefits/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-benefit-catalogue/    # BENEFIT_CATALOGUE
│   │   └── feature-benefit-programs/    # BENEFIT_PROGRAMS
│   │   └── feature-compensation-components/    # COMPENSATION_COMPONENTS
│   │   └── feature-compensation-cycles/    # COMPENSATION_CYCLES
│   │   └── feature-my-benefits/    # MY_BENEFITS
│   │   └── feature-my-compensation/    # MY_COMPENSATION
│   │   └── feature-salary-revisions/    # SALARY_REVISIONS
│   ├── documents/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-document-requests/    # DOCUMENT_REQUESTS
│   │   └── feature-document-templates/    # DOCUMENT_TEMPLATES
│   │   └── feature-document-types/    # DOCUMENT_TYPES
│   │   └── feature-employee-documents/    # EMPLOYEE_DOCUMENTS
│   │   └── feature-my-documents/    # MY_DOCUMENTS
│   ├── employee/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-employee-directory/    # EMPLOYEE_DIRECTORY
│   │   └── feature-employee-import/    # EMPLOYEE_IMPORT
│   │   └── feature-employee-profile-configuration/    # EMPLOYEE_PROFILE_CONFIGURATION
│   │   └── feature-employee-records/    # EMPLOYEE_RECORDS
│   │   └── feature-employment-changes/    # EMPLOYMENT_CHANGES
│   │   └── feature-hr-service-desk/    # HR_SERVICE_DESK
│   │   └── feature-my-hr-requests/    # MY_HR_REQUESTS
│   │   └── feature-my-profile/    # MY_PROFILE
│   │   └── feature-probation-management/    # PROBATION_MANAGEMENT
│   │   └── feature-probation-review/    # PROBATION_REVIEW
│   │   └── feature-team-directory/    # TEAM_DIRECTORY
│   ├── engagement/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-announcement-management/    # ANNOUNCEMENT_MANAGEMENT
│   │   └── feature-announcements/    # ANNOUNCEMENTS
│   │   └── feature-engagement-surveys/    # ENGAGEMENT_SURVEYS
│   │   └── feature-give-recognition/    # GIVE_RECOGNITION
│   │   └── feature-recognition/    # RECOGNITION
│   │   └── feature-recognition-programs/    # RECOGNITION_PROGRAMS
│   │   └── feature-surveys/    # SURVEYS
│   ├── expenses/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-approve-expenses/    # APPROVE_EXPENSES
│   │   └── feature-expense-administration/    # EXPENSE_ADMINISTRATION
│   │   └── feature-expense-policies/    # EXPENSE_POLICIES
│   │   └── feature-my-expenses/    # MY_EXPENSES
│   │   └── feature-my-travel-advances/    # MY_TRAVEL_ADVANCES
│   │   └── feature-reimbursement-runs/    # REIMBURSEMENT_RUNS
│   │   └── feature-team-expenses/    # TEAM_EXPENSES
│   │   └── feature-travel-advance-admin/    # TRAVEL_ADVANCE_ADMIN
│   ├── governance/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-compliance-tracking/    # COMPLIANCE_TRACKING
│   │   └── feature-data-rights-requests/    # DATA_RIGHTS_REQUESTS
│   │   └── feature-policy-acknowledgements/    # POLICY_ACKNOWLEDGEMENTS
│   │   └── feature-policy-management/    # POLICY_MANAGEMENT
│   │   └── feature-retention-policies/    # RETENTION_POLICIES
│   ├── identity-access/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-active-sessions/    # ACTIVE_SESSIONS
│   │   └── feature-api-credentials/    # API_CREDENTIALS
│   │   └── feature-domain-configuration/    # DOMAIN_CONFIGURATION
│   │   └── feature-identity-administration/    # IDENTITY_ADMINISTRATION
│   │   └── feature-my-security/    # MY_SECURITY
│   │   └── feature-security-policies/    # SECURITY_POLICIES
│   │   └── feature-sso-configuration/    # SSO_CONFIGURATION
│   ├── job-architecture/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-job-catalogue/    # JOB_CATALOGUE
│   │   └── feature-position-requirements/    # POSITION_REQUIREMENTS
│   │   └── feature-positions/    # POSITIONS
│   ├── learning/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-learning-paths/    # LEARNING_PATHS
│   │   └── feature-learning-programs/    # LEARNING_PROGRAMS
│   │   └── feature-my-learning/    # MY_LEARNING
│   │   └── feature-team-learning/    # TEAM_LEARNING
│   ├── leave/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-apply-leave/    # APPLY_LEAVE
│   │   └── feature-approve-leaves/    # APPROVE_LEAVES
│   │   └── feature-comp-off-administration/    # COMP_OFF_ADMINISTRATION
│   │   └── feature-comp-off-encashment/    # COMP_OFF_ENCASHMENT
│   │   └── feature-leave-administration/    # LEAVE_ADMINISTRATION
│   │   └── feature-leave-balance/    # LEAVE_BALANCE
│   │   └── feature-leave-encashment/    # LEAVE_ENCASHMENT
│   │   └── feature-leave-policies/    # LEAVE_POLICIES
│   │   └── feature-team-calendar/    # TEAM_CALENDAR
│   ├── notifications/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-email-sender-configuration/    # EMAIL_SENDER_CONFIGURATION
│   │   └── feature-my-notification-preferences/    # MY_NOTIFICATION_PREFERENCES
│   │   └── feature-my-notifications/    # MY_NOTIFICATIONS
│   │   └── feature-notification-rules/    # NOTIFICATION_RULES
│   │   └── feature-notification-templates/    # NOTIFICATION_TEMPLATES
│   │   └── feature-outbound-webhooks/    # OUTBOUND_WEBHOOKS
│   ├── offboarding/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-alumni-management/    # ALUMNI_MANAGEMENT
│   │   └── feature-final-settlements/    # FINAL_SETTLEMENTS
│   │   └── feature-my-exit/    # MY_EXIT
│   │   └── feature-offboarding-operations/    # OFFBOARDING_OPERATIONS
│   │   └── feature-reference-letters/    # REFERENCE_LETTERS
│   │   └── feature-team-offboarding/    # TEAM_OFFBOARDING
│   ├── onboarding/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-my-onboarding/    # MY_ONBOARDING
│   │   └── feature-onboarding-operations/    # ONBOARDING_OPERATIONS
│   │   └── feature-task-templates/    # TASK_TEMPLATES
│   │   └── feature-team-onboarding/    # TEAM_ONBOARDING
│   ├── payroll/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-my-payslips/    # MY_PAYSLIPS
│   │   └── feature-my-tax-declarations/    # MY_TAX_DECLARATIONS
│   │   └── feature-my-tax-documents/    # MY_TAX_DOCUMENTS
│   │   └── feature-payroll-compliance/    # PAYROLL_COMPLIANCE
│   │   └── feature-payroll-inputs/    # PAYROLL_INPUTS
│   │   └── feature-payroll-runs/    # PAYROLL_RUNS
│   │   └── feature-tax-declaration-admin/    # TAX_DECLARATION_ADMIN
│   ├── performance/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-give-feedback/    # GIVE_FEEDBACK
│   │   └── feature-initiate-pip/    # INITIATE_PIP
│   │   └── feature-my-goals/    # MY_GOALS
│   │   └── feature-my-performance/    # MY_PERFORMANCE
│   │   └── feature-my-pip/    # MY_PIP
│   │   └── feature-perf-review/    # PERF_REVIEW
│   │   └── feature-performance-cycles/    # PERFORMANCE_CYCLES
│   │   └── feature-pip-management/    # PIP_MANAGEMENT
│   │   └── feature-team-goals/    # TEAM_GOALS
│   ├── projects/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-assign-projects/    # ASSIGN_PROJECTS
│   │   └── feature-client-management/    # CLIENT_MANAGEMENT
│   │   └── feature-my-projects/    # MY_PROJECTS
│   │   └── feature-project-data-import/    # PROJECT_DATA_IMPORT
│   │   └── feature-project-management/    # PROJECT_MANAGEMENT
│   │   └── feature-team-utilization/    # TEAM_UTILIZATION
│   │   └── feature-utilization-policies/    # UTILIZATION_POLICIES
│   ├── recruitment/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-background-checks/    # BACKGROUND_CHECKS
│   │   └── feature-candidate-pipeline/    # CANDIDATE_PIPELINE
│   │   └── feature-employee-referrals/    # EMPLOYEE_REFERRALS
│   │   └── feature-interview-operations/    # INTERVIEW_OPERATIONS
│   │   └── feature-interview-panel/    # INTERVIEW_PANEL
│   │   └── feature-job-requisitions/    # JOB_REQUISITIONS
│   │   └── feature-offer-management/    # OFFER_MANAGEMENT
│   │   └── feature-referral-management/    # REFERRAL_MANAGEMENT
│   ├── skills/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-competency-catalogue/    # COMPETENCY_CATALOGUE
│   │   └── feature-my-skills/    # MY_SKILLS
│   │   └── feature-skills-catalogue/    # SKILLS_CATALOGUE
│   │   └── feature-team-skills/    # TEAM_SKILLS
│   ├── timesheet/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-approve-timesheets/    # APPROVE_TIMESHEETS
│   │   └── feature-my-timesheet/    # MY_TIMESHEET
│   │   └── feature-team-timesheet/    # TEAM_TIMESHEET
│   │   └── feature-timesheet-administration/    # TIMESHEET_ADMINISTRATION
│   │   └── feature-timesheet-policies/    # TIMESHEET_POLICIES
│   ├── workflow/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-my-approvals/    # MY_APPROVALS
│   │   └── feature-my-tasks/    # MY_TASKS
│   │   └── feature-workflow-definitions/    # WORKFLOW_DEFINITIONS
│   │   └── feature-workflow-operations/    # WORKFLOW_OPERATIONS
│   ├── workforce-foundation/
│   │   ├── data-access/
│   │   ├── ui/
│   │   ├── util/
│   │   └── feature-identification-types/    # IDENTIFICATION_TYPES
│   │   └── feature-lookup-values/    # LOOKUP_VALUES
│   │   └── feature-org-chart/    # ORG_CHART
├── api/
│   ├── database/
│   │   ├── migrations/
│   │   ├── seed/
│   │   └── kysely/
│   ├── access-control/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── analytics/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── assets/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── attendance/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── audit/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── compensation-benefits/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── documents/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── employee/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── engagement/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── expenses/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── governance/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── identity-access/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── job-architecture/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── learning/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── leave/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── notifications/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── offboarding/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── onboarding/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── payroll/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── performance/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── projects/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── recruitment/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── skills/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── timesheet/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── workflow/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
│   ├── workforce-foundation/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── transport/
│   │   └── module/
└── contracts/
    ├── access-control/
    ├── analytics/
    ├── assets/
    ├── attendance/
    ├── audit/
    ├── compensation-benefits/
    ├── documents/
    ├── employee/
    ├── engagement/
    ├── expenses/
    ├── governance/
    ├── identity-access/
    ├── job-architecture/
    ├── learning/
    ├── leave/
    ├── notifications/
    ├── offboarding/
    ├── onboarding/
    ├── payroll/
    ├── performance/
    ├── projects/
    ├── recruitment/
    ├── skills/
    ├── timesheet/
    ├── workflow/
    ├── workforce-foundation/
```

Domains: 26
Apps: 170
