# HCM-3 monthly period fence validation

Verified locally on 2026-09-28 against migration 44 in disposable PostgreSQL.
The [reviewed physical design](HCM-3-PERIOD-FENCE-REVIEW.md) adds tenant-owned
monthly periods, immutable lock bases and a transaction-bound read/fence port.
It is prerequisite storage, not an implemented period-management business app.

Four real SQL tests pass. They cover explicit absent months, leap-month ends,
chronological month enumeration, input-digest changes after creation, invalid
ranges/revisions, lifecycle rejection, immutable lock update/delete denial and
atomic lock-pointer enforcement through a deferred constraint. The same-tenant
period/lock/actor references and RLS deny known foreign identities and missing
tenant context. Reopen is rejected until its independently approved source-case
and linked-delta adapter is implemented.

The concurrency test uses separate restricted PostgreSQL connections and actual
lock-wait inspection. A shared publication fence prevents both insertion of a
previously absent month and transition of an existing Open month to Closing until
the reader transaction settles. Different connection DateStyle settings resolve
to the same canonical month fence. Preview snapshots remain unchanged during the
wait and expose the committed new state afterwards.

The four dated configuration-input tests also pass (eight combined). Targeted
ESLint, module TypeScript and the hcm-api build pass. No human close approval,
source reconciliation, automatic monthly scheduling, public period endpoint or
workday/impact worker completion is claimed. No developer database was migrated.
The owning application must acquire tenant authority first, then ascending month
fences before domain row locks, and revalidate preview evidence before publication.

Reproduce with Docker and installed dependencies:

```sh
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/attendance/module/src/lib/period-fences.database.spec.ts libs/hcm/api/attendance/module/src/lib/configuration-inputs.database.spec.ts
pnpm exec tsc --noEmit --allowImportingTsExtensions -p libs/hcm/api/attendance/module/tsconfig.lib.json
pnpm exec nx build hcm-api
```

Apply forward migration 44 through the explicit migration procedure before a
consumer uses these period ports. Neither API startup nor worker startup applies
migrations. Published workday storage, real impact calculations and governed
period commands remain implementation work in the approved sequence.
