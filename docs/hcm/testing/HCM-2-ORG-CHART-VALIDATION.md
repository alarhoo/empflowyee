# Org Chart validation

Branch: `codex/hcm-2-org-chart`, started from `codex/hcm-2-employee-profile-configuration`. It
carries the second app of delivery step 10 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order).

## Behavior and review

Org Chart (`ORG_CHART`) is released at `/workforce-foundation/org-chart` as `UX-FP-FCL`
NATIVE, following the approved [FDD](../apps/org-chart/FDD.md) and
[TDD](../apps/org-chart/TDD.md).

- **API** (`/api/v1/workforce-foundation/org-chart`, read-only):
  - `GET roots` pages current primary assignments without a current primary solid line.
  - `GET nodes/{assignmentId}` returns one node's details.
  - `GET nodes/{assignmentId}/reports` pages its direct reports.
  - `GET nodes/{assignmentId}/path` returns the ancestor path, bounded to 50 levels by a
    recursive query that stops at repeats. A reporting cycle in data returns 409
    `invalid-state`, never an endless walk.
  - `GET search?q=` matches normalized, accent-free names or a worker number prefix, with at
    least two characters.
  - Every read requires `hcm.workforce-foundation.org-chart.read` and entitlement
    `hcm.workforce-foundation`.
- **Paging and inclusion.** Pages default to 50 (search 25), sorted by display name then
  assignment. Only Active, OnNotice and Suspended employments with an assignment effective
  today in the organisation time zone appear; Pending and Ended never do.
- **Field policy.**
  - Every person field passes through `OrgChartFieldPolicy`, implemented by the employee
    module and injected at the API root: display name, worker number, designation,
    organisation unit, department, location, work email and manager.
  - A field whose effective visibility is not Organization is omitted from the DTO. A tenant
    narrowing of work email removes it on the next read. If display names are narrowed, the
    UI shows _Name not shared_.
  - Search uses names or worker numbers only while those fields are Organization-searchable.
  - `OrgChartFieldPolicy` gained `searchable()`, and `display-name` joined its fields.
- **Concurrent assignments.** Each is a separate node. When a worker has several current
  assignments, each node carries the legal entity or unit as its context label.
- **UI.**
  - Begin column: `HcmDynamicPage` with a name or worker number search in the header and a
    UI5 Tree with lazy, paged expansion. Search results replace the tree; choosing one loads
    its path, expands the ancestors and selects the node.
  - Mid column: `HcmObjectPage` per assignment with an Avatar, Overview (a `mailto:` Link for
    work email and a Link to the manager's node) and a server-mode Direct reports table (25,
    growing, row navigation).
  - Assignment ids are opaque and contain slashes, so the deep link
    `/workforce-foundation/org-chart/:assignmentId` keeps them as one encoded segment.
- **Informational only.** There are no mutation routes or actions.

## Verification

Recorded on 2026-09-26 against the local stack.

- `libs/hcm/api/employee/module/src/lib/org-chart.database.spec.ts`: 5 tests pass. The spec
  composes both modules through the global employee module, as the API root does. It
  covers:
  - roots for all four personas and report paging with cursors (REQ-001);
  - organisation-visible details only, and a tenant narrowing of work email (REQ-003);
  - name, accent-insensitive name and worker number search, no match on email, short
    queries refused, the ancestor path, and a data cycle refused (REQ-002);
  - Pending employments excluded, and no mutation routes (REQ-004);
  - a missing grant, disabled entitlement, disabled actor and unknown node (REQ-005).
- `apps/hcm/web-e2e/live/org-chart.spec.ts`: 3 live browser tests pass. They cover:
  - keyboard tree expansion, person details with the `mailto:` link, direct reports and the
    manager link;
  - search with a too-short query, path reveal, and the deep link after a reload;
  - 390/768/1440/2560 widths with axe, and a failed node read with Retry.
- For the full `pnpm hcm:db:test` result, see [below](#database-suite).
- Also passing: `hcm-web` and `hcm-api` production builds, lint for the changed projects,
  `pnpm ux:check-pages`, `pnpm architecture:check`, `pnpm docs:check` and
  `pnpm hcm:app:readiness --app=ORG_CHART --check`.

Axe excludes only the shared findings recorded for
[Organization Structure](HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared).

## Open points

- **Incomplete records indicator.** The TDD mentions a safe count of minimal spine rows for
  HR only. The seeded workforce has no such rows since `workforce.foundation@3`, and the org
  chart permission is the same for every persona, so no HR-only indicator is shown yet. The
  rows are excluded from the chart as required.

### Database suite

`pnpm hcm:db:test`: 200 of 201 tests across 33 files pass after the step 9 policy spec was
updated to expect `display-name` among the org chart fields. The one failure is the
pre-existing Linux-only `local-document-files.spec.ts` case. The employee suite passes 18
tests.

## Connected chart verification — 2026-09-27

Chart is now the default presentation alongside the retained native Tree option.
Both use the same roots, expanded branches, selected assignment, search and detail
routes. D3 supplies layout coordinates in a shared UX component; native UI5 cards,
avatars, buttons and segmented controls provide the interactions. The floorplan
remains native FCL with page-backed columns.

- Three isolated layout tests pass: independent roots and correct edges, 50 reports
  without overlapping cards or escaping the canvas, and collapsed/empty layouts
  without mutating caller data.
- All five live browser scenarios pass across the full run and the two targeted
  chart reruns after the heading-order correction. Coverage includes keyboard
  expansion, Chart/Tree switching, selected cards and person details, search/path
  reveal and reload, zoom/fit/reset, collapse, 390/768/1440/2560 widths, failed reads
  and retry. Diagram overflow stays local.
- Chart axe checks pass with the existing shared exclusions above; no additional
  exclusion was added. A native H2 section heading precedes native H3 card headings.
- Angular compilation, changed-library and browser-test lint, production HCM web
  build, page structure, architecture and documentation checks pass.

API contracts, authorization, field policy and database behavior are unchanged;
the database results above remain historical evidence. The browser cancels pending
branch/path reads on context changes and deduplicates path nodes during paging.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:documents:prepare
pnpm hcm:db:test
pnpm dev:hcm-api   # port 4402
pnpm dev:hcm       # port 4302
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts org-chart.spec.ts
pnpm exec vitest run --config libs/hcm/web/ux/hierarchy-chart/vite.config.mts
pnpm hcm:app:readiness --app=ORG_CHART --check
```
