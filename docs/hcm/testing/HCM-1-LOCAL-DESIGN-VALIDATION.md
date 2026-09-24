# HCM-1 local-stage design validation

Design-only review dated 2026-09-24. See the
[review index](../roadmap/HCM-1-DESIGN-REVIEW.md) for all 20 packages.

## Result

The 20 approved local-stage apps have FDD, TDD, decisions, traceability and blueprint
documents. The stage/access/document-notification business choices are resolved.
There are 120 stable requirements, each mapped to a design selection and a named
planned test scenario. Five domain contracts, the common technical contract and
39 distinct business permissions complete the shared design scope.

The actual factory admission checks return **0 ready / 20 blocked**, deliberately.
All reported blockers are document-revision approval and its unpublished canonical
metadata, not missing app documents, missing references, unmapped requirements,
unresolved local business decisions or malformed project/contract declarations.
Do not interpret structural completeness as approval or full HCM-1 completion.

| Remaining gate                                                                 | Why it remains                                                                                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `APPROVAL_REQUIRED`                                                            | No human has reviewed the exact newly authored document/blueprint bytes yet.                                                              |
| `MISSING_LIST` at `approvals.approvals` only                                   | The approval ledger is intentionally empty, rather than populated with invented approval records.                                         |
| `CATALOGUE_NOT_APPROVED`                                                       | Canonical FDD/TDD/decision summaries await actual revision review.                                                                        |
| `ROUTE_REQUIRED`, `FLOORPLAN_REQUIRED`, `ROUTE_MISMATCH`, `FLOORPLAN_MISMATCH` | Selected route/floorplan are in TDD/blueprint; canonical null values are preserved until approval, as required by catalogue architecture. |

Each app also reports the explicit `BLOCKS_LATER_CAPABILITY` warning for excluded
production authentication/integrations/retention, without making it a local business
blocker. Those exclusions would be current blockers for the six deferred apps.

The [review manifest](HCM-1-LOCAL-REVIEW-MANIFEST.json) lists current normalized
SHA-256 evidence hashes by path and per-app gate summaries. It is **not an approval
ledger**: it has no approved decision, fabricated reviewer or implied consent.

## Reproduce the local-stage admission checks

From repository root with the installed Node/pnpm toolchain, use the existing
factory CLI once for each Local app in the approved roadmap. No new alternative
checker or relaxed approval mode is introduced. This PowerShell procedure is
read-only apart from the factory's ignored temporary context output:

```powershell
$plan = Get-Content docs/hcm/roadmap/HCM-1-LOCAL-DELIVERY.md -Raw
$localApps = [regex]::Matches($plan, '(?m)^\|\s*([A-Z][A-Z_]+)\s*\|\s*[a-z-]+\s*\|\s*Local\s*\|')
if ($localApps.Count -ne 20) { throw 'Local-stage scope differs from the approved 20 apps' }
foreach ($app in $localApps) {
  pnpm hcm:app:readiness "--app=$($app.Groups[1].Value)" --check
  if ($LASTEXITCODE -notin 0, 1) { throw 'Readiness command could not execute' }
}
pnpm hcm:wave:context --wave=HCM-1 --check
```

Expected now: every local app returns exit 1 for the review/publication gates
above; full-wave context remains blocked and includes all 26 apps. After actual
review/publication, local checks should return 0; full-wave exit 1 remains expected
while the six deferred apps lack their own approved designs. Never use the
zero-app admitted scope as evidence that this local stage is ready.

## Verification scope

Completed checks for this document delivery:

| Check                                                                     | Observed result                                                                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing factory CLI, `--app=APP_CODE --check`, each of the 20 Local apps | All commands executed; all exit 1 solely for the documented review/publication gates. No other evidence defects.                                               |
| `pnpm hcm:wave:context --wave=HCM-1 --check`                              | Exit 1, all 26 apps retained, 0 ready.                                                                                                                         |
| `pnpm hcm:factory:test`                                                   | 15 tests passed, including stale approvals, omitted blockers and malformed evidence.                                                                           |
| `pnpm docs:check`                                                         | Required documentation and unchanged 170-app runtime catalogue projection passed.                                                                              |
| `pnpm architecture:check`                                                 | Passed; no new Nx projects or runtime dependencies.                                                                                                            |
| Document evidence audit                                                   | All 20 packages; 120 requirement/design/test mappings; 39 distinct permissions; unique routes; 26 declared native wrapper symbols found in installed packages. |
| Link audit                                                                | 713 relative links and heading anchors checked, zero defects.                                                                                                  |
| Prettier / Nx format and Git whitespace                                   | Passed for maintained changes.                                                                                                                                 |

The supplementary evidence audit checks design structure and references only. It
does not override the actual factory gate or approve a human-review revision.

Application builds, app acceptance tests, migrations, seeds and browser checks are
intentionally not executed as evidence for unimplemented HCM-1 features. All app
traceability test entries are plans to execute during separately authorized
implementation. No application code, Nx project configuration, canonical catalogue,
generated runtime projection, database row or installed dependency is changed here.
