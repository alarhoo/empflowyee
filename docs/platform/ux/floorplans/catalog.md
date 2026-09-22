# empFLOWyee floorplan catalog

A floorplan is a reusable page-level UX pattern. It is not a business feature and it is not an Nx deployable application.

The catalog deliberately separates **behavioral specification** from **technology implementation**. HCM, Account and Console may implement the same platform floorplan with different UI libraries.

A listed ID does not approve a product implementation. Each product records its installed capabilities, implementation choice and acceptance evidence. HCM's current correction is limited to Dynamic Page and Object Page; other generated candidates are deferred.

## IDs

Floorplan IDs are stable documentation identifiers. FDD/TDD references the ID, not a CSS class or component-library name.

| ID                      | Intent                                                        |
| ----------------------- | ------------------------------------------------------------- |
| `UX-FP-STANDARD-PAGE`   | Simple page with title/actions/content                        |
| `UX-FP-DYNAMIC-PAGE`    | Collapsible/expandable header with persistent title/actions   |
| `UX-FP-FCL`             | List-detail-detail / master-detail progression in 1–3 columns |
| `UX-FP-WIZARD`          | Guided multi-step process                                     |
| `UX-FP-OBJECT-PAGE`     | Rich display/edit page for one business object with sections  |
| `UX-FP-LIST-REPORT`     | Filter/search + result set + table/list actions               |
| `UX-FP-WORKLIST`        | Task-oriented searchable work queue                           |
| `UX-FP-OVERVIEW`        | Cards/tiles/summary blocks across multiple concerns           |
| `UX-FP-ANALYTICAL-LIST` | Filters + analytical summary + detailed result set            |

### Earlier documentation identifiers

`UX-FP-FLEXIBLE-COLUMN` in the Shell + Theme Lab TDD refers to the canonical
`UX-FP-FCL` pattern above. Earlier `UX-FP-FORM` references describe the supporting
[form standard](../forms/form-standard.md), not a tenth floorplan. Keep these
references readable when maintaining historical implementation records; new TDDs
use the canonical catalog IDs.

## Universal states

Every implementation must define the behavior of the states relevant to it:

- loading
- no data / first-use
- error / retry
- unavailable/not entitled
- unauthorized
- read-only
- edit/action in progress
- responsive narrow/medium/wide

## Non-goals

A floorplan does not own:

- backend calls
- business authorization decisions
- domain rules
- feature-specific routes
- tenant entitlements
