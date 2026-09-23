# HCM codebase structure

The physical source tree is organized by product boundary → runtime → domain → technical role.

Launchpad Spaces/Pages are deliberately not source-code folders.

## Frontend

```text
libs/hcm/web/<domain>/
├── feature-<app>/   # one lazy business feature per app where appropriate
├── data-access/     # API consumption/state for the domain
├── ui/              # reusable domain-presentational components
└── util/            # pure domain web helpers only
```

## Backend

```text
libs/hcm/api/<domain>/
├── domain/
├── application/
├── infrastructure/
├── transport/
└── module/
```

## Contracts

```text
libs/hcm/contracts/<domain>/
```

Contracts are runtime-universal DTO/event types. Frontend never imports backend implementation.

## Database tooling

```text
libs/hcm/api/database/
├── migrations/
├── seed/
└── kysely/
```

This is infrastructure tooling for the one `hcm_db` / main `hcm` namespace; domain-owned tables remain logically owned by their domain even though they share one PostgreSQL namespace.

## Planned directories vs Nx projects

`materialize-hcm-structure.mjs` creates empty directories so the complete future codebase is visible in VS Code. It does not create Nx projects. When an app/domain becomes implementation-ready, use the approved Nx generator at the planned path so tags and project boundaries are real and enforceable.
