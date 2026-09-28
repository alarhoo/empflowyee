# HCM-3 immutable workday storage validation

Verified locally on 2026-09-28 with forward migration 45 and the restricted
PostgreSQL runtime role. The [reviewed physical design](HCM-3-WORKDAY-STORAGE-REVIEW.md)
adds immutable workday revisions, typed calendar sources and exact interval rows.
The AttendanceResolve-only writer uses the existing opaque workload capability,
monthly period fences and employment/date serialization. It does not issue
workload authority, claim/complete jobs or publish a public workday endpoint.

Four real PostgreSQL tests pass using the actual runtime workload issuer and
transaction adapter. Concurrent identical input appends produce one revision;
subsequent changed input links the exact prior result and a stale predecessor is
rejected. The DST cross-midnight case retains 27,000,000 scheduled-work milliseconds,
1,800,000 unpaid-break milliseconds, a 5,400,250-millisecond explicit holiday interval
across the repeated hour, and 21,599,750 expected-work milliseconds. Both actual
endpoint offsets and typed holiday identity are persisted without rounding.

Inconsistent totals, wrong offsets and missing holiday-source references roll
back the whole evidence graph. SQL verifies expected intervals equal work minus
holidays. A configured Rest pattern can persist an actual zero duration; missing
configuration is never manufactured by this adapter. Closing periods reject
ordinary publication. Runtime update/delete and post-commit child insertion are
denied. Copied workload contexts, another workload, and foreign tenant sources
cannot publish. Historical revisions remain immutable.

The test harness migrates and removes a disposable database. Its direct source
publication SQL is explicit fixture setup; no production holiday publication or
assignment command is claimed. The owning worker must still read current source
inputs, revalidate every digest, handle unavailable/conflict outcomes and commit
its receipt/audit/outbox completion under the durable lease fence. Those handlers,
roster/override paths and application acceptance remain pending.

Reproduce with Docker and installed dependencies:

```sh
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/attendance/module/src/lib/published-workdays.database.spec.ts
pnpm exec tsc --noEmit --allowImportingTsExtensions -p libs/hcm/api/attendance/module/tsconfig.lib.json
pnpm exec nx build hcm-api
```

Targeted ESLint, module TypeScript, the hcm-api build, architecture and documentation
checks pass. All 61 admitted apps remain ready, including HCM-3 23/23 with zero
blockers; this design readiness does not establish business-app acceptance.

No developer database was migrated or reset. Deployments must explicitly apply
migration 45 before consuming this storage; API/worker startup never migrates.
