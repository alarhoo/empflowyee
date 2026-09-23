# App blueprint and implementation readiness

HCM0-05 implements the [readiness design](../tdd/TDD-HCM-0-READINESS.md).
Catalogue flags summarize decisions; reviewed documents remain authoritative.
The gate checks evidence integrity and completeness, not the quality of business
decisions or a reviewer's identity. Git/PR review must verify both.

## Prepare and inspect

```sh
pnpm hcm:app:context --app=EMPLOYEE_DIRECTORY
pnpm hcm:app:readiness --app=EMPLOYEE_DIRECTORY
pnpm hcm:app:readiness --app=EMPLOYEE_DIRECTORY --check
pnpm hcm:wave:context --wave=HCM-2 --check
```

Context commands write only ignored `.tmp/hcm-factory/*.context.json`; the readiness
command prints JSON and writes nothing. `ready`, `issues`, `warnings` and `evidence`
describe the exact current inputs. Issues contain stable `code`, `at` and `message`
fields; evidence includes the current content hash. Without `--check`, incomplete
apps can still produce useful context. `--check` exits 1 for blocked inputs; invalid
readiness CLI arguments exit 2. HCM-0 has no business apps, so its context is available
but `--check` deliberately cannot certify an empty business wave.

Use `--all` for an inventory report. `--admitted --check` is the CI scope: apps with
approved FDD/TDD summaries, implementing/complete status, or an existing canonical
feature `project.json`. Draft planned apps can remain incomplete. Zero admitted
apps means zero implementation claims checked, not 170 approved apps.

## Blueprint format 1

Copy the [blank blueprint](templates/app-blueprint.json) and
[blank approval ledger](templates/app-approvals.json) into the app's canonical
`docs/hcm/apps/<app-slug>/` directory as `BLUEPRINT.json` and `APPROVALS.json`.
Templates intentionally fail readiness. Do not generate all app documents/projects
in advance, fabricate approvals, or copy synthetic positive test evidence.

All fields are required; unknown fields fail. App code/domain match the catalogue.
Lists are nonempty except explicitly reviewed `decisions` and `prerequisites`.

| Field                              | Record format and meaning                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `documents`                        | `{id, kind, path}` with unique IDs/paths; repository-relative Markdown under `docs/hcm/` or `docs/platform/`                         |
| `route`                            | Exact approved catalogue route beginning with `/`                                                                                    |
| `floorplan`                        | `{id, mode, ref}`; canonical platform ID, `NATIVE` or `COMPOSED`, and TDD selection evidence                                         |
| `nativeComponents`                 | `{package, version, imports, ref}`; maintained UI5/Fundamental package, inspected version, nonempty import names and TDD/UX evidence |
| `contracts`, `data`, `permissions` | `{id, owner, ref}`; contract IDs, tables/read models and business permissions with explicit owners and design references             |
| `projects`                         | `{name, root, tags}`; domain-owned HCM library roots and the four Nx taxonomy dimensions; include the canonical feature root         |
| `prerequisites`                    | `{id, state, ref}`; all entries must be `resolved` with reviewed contract/design evidence                                            |
| `foundations`                      | `{id, ref}`; HCM0-01, HCM0-02, HCM0-03 and HCM0-04, referencing registered foundation evidence                                       |
| `decisions`                        | `{id, classification}`; exact projection of the reviewed decision register below                                                     |
| `requirements`                     | Stable FDD references, such as `FDD#REQ-DIRECTORY-001`                                                                               |
| `tests`                            | `{id, kind, ref}`; test-plan IDs, test category and reviewed scenario evidence                                                       |
| `traceability`                     | `{requirement, design, tests}`; map each requirement to a TDD selection and nonempty declared test IDs                               |
| `delivery`                         | `{branch, commits}`; short-lived branch and nonempty coherent commit plan                                                            |

Register exactly one `fdd`, `tdd`, `traceability` and `decisions` document at the app's
`FDD.md`, `TDD.md`, `TRACEABILITY.md` and `DECISIONS.md` paths. Include a `domain`
document. Additional supported kinds are `foundation`, `contract` and `ux`.
`BLUEPRINT` is reserved for the blueprint's own approval record.

References use `document-id#stable-id`, matching a Markdown heading's first token
(for example `## REQ-DIRECTORY-001 — Search`) or an explicit
`<a id="stable-id"></a>` anchor. Every FDD `REQ-` heading must be registered and
covered. Use stable IDs rather than headings likely to change with editorial wording.

Native component evidence must explain the actual installed Angular/UI5 capability
inspection. A floorplan catalog ID alone does not approve its HCM implementation.
Business API permissions cannot be substituted with `hcm.catalogue.*` discovery
permissions. Existing Nx projects must agree with reviewed names/tags; future
projects are declarations only until generated through approved tooling.

## Decisions and approvals

`DECISIONS.md` contains this explicit table, including its header even when empty:

```md
| ID              | Classification  | Decision                         |
| --------------- | --------------- | -------------------------------- |
| DEC-EXAMPLE-001 | BLOCKS_THIS_APP | Product decision still required. |
```

Every `DEC-` row must match the blueprint. `BLOCKS_THIS_APP` denies readiness;
`BLOCKS_LATER_CAPABILITY` produces a visible warning; `RESOLVED` records a concluded
decision. Classify decisions with the product owner; never change a classification
just to pass the gate. The Markdown explanation carries the decision and rationale.

After human review, the approval ledger records one entry per registered document
and one for `BLUEPRINT`:

```json
{
	"document": "FDD",
	"sha256": "the-reviewed-content-hash-from-the-report",
	"decision": "approved",
	"reviewer": "actual reviewer identity",
	"reviewedAt": "2026-09-23",
	"reviewEvidence": "actual review record or PR reference"
}
```

This example is not approval evidence. The reviewer confirms the exact current
content and its canonical metadata summary. SHA-256 uses UTF-8 with CRLF normalized
to LF. Changing documents or the blueprint invalidates the old approval; review
the new content instead of blindly updating hashes. The ledger itself is reviewed
through Git and is not self-signed. These tools never create approval records.

## Foundation evidence and verification

Current prerequisite evidence is in [launchpad validation](../testing/HCM-0-LAUNCHPAD-VALIDATION.md),
[database validation](../testing/HCM-0-DATABASE-VALIDATION.md),
[seed validation](../testing/HCM-0-SEED-VALIDATION.md) and
[persistent runtime validation](../testing/HCM-PERSISTENT-RUNTIME-VALIDATION.md).
Reference and review the applicable current evidence when preparing an app.

Run `pnpm hcm:factory:test` for positive and adversarial checks in isolated temporary
repositories. CI runs these tests and the admitted-app gate; ordinary context
generation never updates catalogue state. See
[HCM0-05 validation](../testing/HCM-0-READINESS-VALIDATION.md) for verified results.
