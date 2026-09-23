# HCM0-05 readiness validation

Verified locally on 2026-09-23 with the pinned Node 24.21.0/pnpm 12.5.1 toolchain.
This covers the [blueprint/readiness gate](../engineering/APP-READINESS.md), not
approval of any business app or production deployment.

## Automated evidence

`pnpm hcm:factory:test` passes 15 tests: four existing factory regressions and
eleven readiness scenarios in isolated temporary repositories. Coverage includes:

- A complete approved synthetic blueprint passing deterministically without writes.
- Missing documents/approval ledgers, malformed JSON and invalid shapes.
- Changed document/blueprint hashes and stale canonical approval summaries.
- Omitted blocking decisions, unreviewed classifications and nonblocking deferred capabilities.
- Unresolved contracts, absent routes/floorplans and prerequisite foundation evidence.
- Missing requirement/design/test links and omitted FDD requirements.
- Project ownership/tag drift and discovery permissions rejected as business grants.
- Traversal, symlink/junction and Windows alternate-stream paths rejected.
- Reviewer/date requirements and explicit decision-register structure.
- Real CLI scopes, nonzero check exits, read-only reports and CI admission detection.

`pnpm hcm:app:readiness --all` reports **170 checked, 0 ready, 170 blocked** against
the actual canonical catalogue. No actual approval ledger or app blueprint was
generated. `--admitted --check` succeeds with **0 checked**, because the catalogue
currently makes no approved/implemented business-app claims and has no canonical
business feature projects. Tests prove a claim or feature project activates the gate.

App and wave contexts carry the same machine-readable evidence diagnostics.
Context generation remains useful for unfinished designs. HCM-0 context remains a
foundation report; explicit business readiness checking rejects its empty app set.

## Repository checks and operation

Verified tooling ESLint, changed-file Prettier, architecture verification,
documentation/catalogue validation, runtime catalogue projection and seed projection
checks. The changed PR workflow passes checksum-verified actionlint 1.7.12.
CI runs factory tests and the admitted-app gate without deploying or updating approval
state. No application, dependency, persistence or runtime build input changed beyond
package-script registration; no application build/database test rerun is required
for this tooling-only milestone.

The database inspection procedure was exercised with `hcm_runtime` inside the
running PostgreSQL container. With transaction-local `local-dunder-mifflin` context,
`hcm.person` returns Jim Halpert, Michael Scott, Toby Flenderson and David Wallace.
No migrations, seeds, business data or authentication settings were changed.
