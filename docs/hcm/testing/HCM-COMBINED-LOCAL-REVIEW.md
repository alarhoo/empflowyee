# Combined HCM local review

Verified on 2026-09-28 on `codex/hcm-combined-local-review`. This is a local
integration and smoke-check record, not approval or full acceptance of every app.

The branch includes HCM-3 through `1862e38`, which already contains the local
`codex/hcm-2-my-hr-requests` tip `36da707`. After fetching origin, that HCM-2 tip
and remote `d1e5e00` have identical file trees. The integration also merges
`codex/org-chart-view` (`47db650`), including the My Profile refinements in
`2e2e914`. Conflicts preserve the updated profile layout, contact validation,
existing employee/Attendance exports and the My HR Requests correction link.

## Local runtime

Dependencies installed with the frozen lockfile. A PostgreSQL custom-format backup
was saved under ignored `.local/hcm/backups/` before the explicit `hcm:db:up` command
applied 23 pending migrations and 13 seed versions. Existing data and the local
field-encryption key were preserved. There was no reset or cloud deployment.

Fresh uncached builds started the web server on port 4302 and the local API on
port 4402. Use `http://acme.localhost:4302` so the tenant Host is preserved. API
liveness returned 200. Startup procedures are in the root README. Runtime logs for
this run are ignored `.tmp/hcm-review-{api,web}.log` and corresponding `.err.log`
files. The existing PositionRequirementSet unused-import compiler warning remains.

## Executed checks

- My Profile read view, Personal/Employment navigation and feature accessibility;
  the correction link opens the prefilled My HR Requests dialog without submission.
- Org Chart connected cards, person details and Chart/Tree state preservation.
- All 171 catalogue entries across five Spaces and 20 Pages; planned-app dialog
  and persona inspection behavior. The stale My Profile Planned expectation was
  replaced with Holiday Calendars, which remains Planned.
- Focused TypeScript-source ESLint, architecture and documentation checks passed.
  Native template compilation passed in the fresh web build.

Reproduce the three browser checks against the running local servers:

```sh
pnpm exec playwright test --config=apps/hcm/web-e2e/local-launchpad.config.mts my-profile.spec.ts org-chart.spec.ts launchpad.spec.ts --grep "opens Personal|explores connected cards|boots a real local tenant"
```

Current admitted readiness is 58/61: Holiday Calendars retains DEC-HCM3-024, and
the incoming My Profile and Org Chart FDD/TDD/traceability revisions have stale
approval hashes. No approval was fabricated to clear these findings. Planned
apps remain unavailable. HCM-3 still has only Work Schedule Templates complete;
the remaining 22 apps are not presented as implemented.
