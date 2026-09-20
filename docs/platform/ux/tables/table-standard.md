# Enterprise Table Standard

Tables support two approved data modes.

## Client mode

Use when the bounded dataset is intentionally loaded into the browser and local sorting/filtering is appropriate.

## Server mode

Use for large/unbounded datasets. Pagination, sorting, filtering, and search execute server-side.

## TDD declaration

Every significant table must declare:

```text
data mode: client | server
pagination
sorting
filtering
search
selection
bulk actions
column personalization
virtualization
export
responsive behavior
empty/loading/error states
```

The FDD determines business behavior. The TDD determines technical mode and component configuration.
