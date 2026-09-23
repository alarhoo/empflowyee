# HCM0-05 — app blueprint and readiness gate

Status: implemented, with [validation evidence](../testing/HCM-0-READINESS-VALIDATION.md).

## Scope and ownership

Extend `tools/hcm-factory`; do not add an Nx project, deployable, schema, business
feature or authentication boundary. The catalogue remains the inventory authority.
This gate establishes whether implementation inputs have reviewed evidence; it
does not certify the resulting business implementation or replace human review.

Each app has `docs/hcm/apps/<slug>/BLUEPRINT.json` and `APPROVALS.json`. The blueprint
references current FDD, TDD, domain, decision and traceability documents and records
route, floorplan/mode, native-control evidence, contracts, data ownership,
permissions, project tags, prerequisites, tests and commit slices. It also cites
the HCM0-01–04 foundation evidence. Documents remain the source of business truth.

Approval records identify the document, reviewer, date and review evidence and pin
the SHA-256 of the reviewed content. The blueprint itself needs a separate approval
record. UTF-8 text is hashed with CRLF normalized to LF. Editing a document or
blueprint invalidates its previous approval; catalogue flags cannot compensate.
The gate never writes approvals, hashes into records, catalogue fields or source.
It reports current hashes to help a human review the exact revision. Git/PR review
establishes reviewer authority; a JSON record alone cannot prove human identity.

## Evaluation

Fail closed on absent/malformed evidence, unknown fields, duplicate identities,
unsafe or symlinked paths, unapproved/stale hashes, mismatched catalogue summaries,
missing selections, inconsistent domain-owned project declarations, unreviewed
prerequisites and unresolved `BLOCKS_THIS_APP` decisions. Check referenced Markdown
headings/anchors and requirement-to-test coverage. Cross-check every classified
decision row in the decision document so a blueprint cannot omit a blocker.
`BLOCKS_LATER_CAPABILITY` remains visible as a warning without blocking this app.
Floorplan IDs come from the platform catalogue; mode is NATIVE or COMPOSED.

The evaluator exposes stable diagnostic codes and evidence locations. App/wave
context generation includes the report and remains usable for incomplete apps.
Explicit `--check` exits 1 when any selected app is blocked; bad CLI input exits 2.
HCM-0 has no business apps and its context must not claim wave approval.

CI runs the adversarial tests and checks admitted apps: those with approved design
summaries, implementing/complete status or an existing domain feature project.
Draft planned apps are not expected to pass, so CI does not require all 170 apps
to be ready. CI is validation only; no app is promoted and nothing deploys.

## Verification and rollback

Use isolated synthetic repositories for positive approval evidence. Test unknown
apps, missing/invalid JSON, absent documents, stale hashes/flags, omitted blockers,
deferred decisions, missing route/floorplan, unresolved contracts, unsafe paths,
traceability gaps, ownership mismatch, deterministic context and read-only checks.
Run against the real catalogue to prove every current app remains blocked.
Run tooling lint, formatting, factory/catalogue tests, architecture/docs checks
and workflow validation. Runtime builds/data are unaffected by this tooling change.
Rollback is reverting the tooling/docs/CI commit; no database operation is involved.
