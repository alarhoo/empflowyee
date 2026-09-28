# Work Schedule Templates

Attendance-owned lazy routes at `/attendance/work-schedule-templates`:
list, `/:id?version=...` detail, `/new`, and `/:id/edit?version=...`.
The native FlexibleColumnLayout contains approved Dynamic Page and Object Page
floorplans. Complex drafts use a dedicated Signal Form page; lifecycle reasons
and preview/publication use a native Dialog.

The persisted seed proposal has no selected timezone or break placement.
Creation requires explicit completion or modification of its unpaid-minute
proposal. Published versions remain read-only. Copy creates an independent
ordinary schedule draft, never a live assignment.

Run contract/form checks with:

```powershell
pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts libs/hcm/web/attendance
```

For the real-browser suite, first build `hcm-web` in production configuration
and install Playwright Chromium. The explicit browser configuration provisions
a disposable PostgreSQL database and serves that production-app build through
an isolated loopback proxy to real Nest endpoints:

```powershell
pnpm exec nx build hcm-web --configuration=production
pnpm exec vitest run --config tools/milestones/hcm-3/browser.config.mts libs/hcm/api/attendance/module/src/lib/templates-browser.spec.ts
```

See the [owning TDD](../../../../../docs/hcm/apps/work-schedule-templates/TDD.md)
for the approved business and authorization contract.
