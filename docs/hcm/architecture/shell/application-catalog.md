# HCM Application Catalog

## Structure

```text
Space
  Page
    Group
      Feature
```

Initial Spaces remain:

- Employee
- Manager
- HR Operations
- Analytics
- Administration

## Stable identifiers

Identifiers are machine-oriented and must remain stable even when display labels change.

Examples:

- `employee`
- `employee-overview`
- `employee-information-service`
- `MY_PROFILE`

## Feature policy metadata

A feature can declare:

- required entitlement(s)
- required permission(s)
- optional feature flag
- navigation placements
- route path

Do not use role names as the only policy.

## Implementation separation

Catalog metadata is UX/product metadata. It must not import Angular feature implementation.

The application composition root maps route paths/catalog ids to lazy imports.

## Current implementation

The canonical product inventory is [hcm-app-catalogue.json](../../catalogue/hcm-app-catalogue.json),
[hcm-launchpad.json](../../catalogue/hcm-launchpad.json) owns placement and role
memberships, and [hcm-domain-catalogue.json](../../catalogue/hcm-domain-catalogue.json)
owns stable domain identities. Run `pnpm hcm:catalogue:generate` after changing
these files. `pnpm hcm:catalogue:check` and the documentation check reject a stale
runtime projection in `hcm-runtime-contract`. Generated TypeScript is not another
product authority. All 170 apps have placements; three formerly unplaced personal
apps now belong to Employee Information and Service.

`discoveryPolicy` supplies an explicit discovery permission and domain entitlement.
These identifiers are not business API authorization contracts. Normal Space
placement uses the canonical business-role memberships; individual tiles also
require their explicit discovery capabilities. `canDiscoverHcmFeature` filters
navigation without hiding planned apps. `canAccessHcmFeature` additionally requires
an available implementation and nonempty approved route. Availability requires
complete implementation plus approved FDD/TDD metadata. All current apps, including
MY_PROFILE, remain Planned with null routes/floorplans.

The local session can advertise catalogue inspection. That view exposes all
Spaces/Pages/Groups, while tile activation and direct-route checks still use normal
capabilities. Search deduplicates app identities across placements and matches
title/code/domain/Space/Page/Group labels only within the visible inventory.

`runtime-workspace` is the separate routing proof at `/workspace`, excluded from
the business launchpad. It retains entitlement `employee-core`, permission
`employee.directory.read` and flag `shell-preview`. No business application is
implemented by this proof. Unknown catalogue IDs are denied; empty ancestors are
omitted in normal mode. The unchanged Nx `type:util` boundary prevents imports of
feature implementations. Future business TDDs must define API authorization and
lazy route composition independently of navigation discovery.
