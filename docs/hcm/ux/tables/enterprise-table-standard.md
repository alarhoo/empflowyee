# HCM enterprise table standard

UI5 `Table` is the HCM table base. empFLOWyee adds explicit data-mode and surrounding UX contracts instead of writing another table implementation.

## Data modes

Every TDD using an enterprise table declares one of:

### `client`

Use when the bounded result set is reasonably loaded as a whole. Sorting/filtering/paging may be performed locally.

### `server`

Use for large/unbounded collections. Search, filter, sort and pagination are translated into backend queries by the feature/data-access layer.

The UX library does not make HTTP calls.

## Supported concerns

Select only what the FDD requires:

- sorting
- filtering
- search
- single/multi selection
- bulk actions
- growing/pagination
- virtualization
- column importance/responsive pop-in
- personalization
- export
- empty/loading/error states

Do not enable every feature by default.

UI5 Web Components 2.x exposes table features including single/multi selection, growing and virtualization; verify exact installed APIs before implementation.

## Implemented adapter

Import `HcmEnterpriseTable` and its typed contracts from `@empflowyee/hcm-web-ux-tables`. Supply label, columns and rows. A row has a stable id and a cell map; a column declares id, label, optional sortable and responsive importance. UI5 owns rendering and responsive pop-in.

The query is a signal model containing search, zero-based page, pageSize, and optional column/direction sort. Query changes emit queryRequested. Page sizes are clamped to 1?100; invalid numeric inputs are normalized. Search/sort reset to the first page.

| Mode   | Input ownership                                             | Adapter behavior                                                                                                                                       |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| client | Feature supplies the complete bounded collection            | Locally searches visible cell values, sorts without mutating the source, clamps the page after filtering and slices rows.                              |
| server | Feature supplies the requested page and authoritative total | Displays supplied rows unchanged and emits queryRequested. The feature performs transport, cancellation, authorization, filtering, sorting and paging. |

The initial adapter supports search, sortable columns, explicit paging, importance/pop-in and loading/empty/error/denied/unavailable states. It does not perform HTTP or enable selection, export, bulk actions, personalization or virtualization. Read-only tables expose browsing controls but no mutation actions.

The **Tables/Enterprise Table** stories use 12 deterministic local rows. The server story simulates latency and query ownership outside the presentation component, canceling stale timers. Its query readout is workshop evidence, not product UI. Production server-mode owners must prevent stale responses from replacing newer results and keep query/total consistent with the displayed page.

Run `pnpm nx test hcm-web-ux-tables` for query/ownership tests and the [Storybook test runner](../storybook.md#build-and-test) for both data modes in a browser.
