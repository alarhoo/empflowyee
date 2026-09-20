# Nx Project Taxonomy

Every Nx project has four architectural dimensions.

```text
product:<marketing|account|hcm|console|platform>
runtime:<web|api|universal>
domain:<meaningful-domain>
type:<architectural-role>
```

Example:

```text
hcm-web-leave-feature-apply

product:hcm
runtime:web
domain:leave
type:feature
```

## Naming

Use:

```text
<product>-<runtime>-<domain>-<type>-<feature?>
```

Examples:

```text
hcm-web-leave-feature-apply
hcm-web-leave-data-access
hcm-api-leave-domain
hcm-api-leave-application
hcm-api-leave-infrastructure
hcm-api-leave-transport
hcm-api-leave-module
hcm-leave-contract
```

## Frontend types

- `type:app` — deployable composition root
- `type:shell` — product shell/navigation/session composition
- `type:feature` — user-facing lazy-loaded capability
- `type:data-access` — HTTP/state/cache/data mapping
- `type:ui` — reusable presentational domain UI
- `type:floorplan` — reusable page/floorplan composition
- `type:util` — small pure helpers
- `type:contract` — explicit runtime-neutral contracts

## Backend types

- `type:app`
- `type:domain`
- `type:application`
- `type:infrastructure`
- `type:transport`
- `type:module`
- `type:contract`
- `type:util`

## Physical hierarchy

Physical folders optimize human understanding; Nx tags provide enforcement.

```text
libs/hcm/web/<domain>/<project>
libs/hcm/api/<domain>/<project>
libs/hcm/contracts/<domain>
```

A folder such as `libs/hcm/web/leave/` is an organizational group, not necessarily one Nx project.
