# ADR-0001: Nx Monorepo and Product Boundaries

- Status: Accepted
- Date: 2026-09-21

## Decision

Use one pnpm-managed Nx monorepo with four product boundaries and seven deployable application projects.

## Why

The products are related and benefit from one dependency graph, shared engineering standards, atomic changes, caching, affected execution, and AI-visible architecture, while still requiring independent runtime/deployment/security boundaries.

## Consequences

- `apps/` contains deployable composition roots.
- `libs/` contains implementation.
- product tags prevent implementation leakage.
- account/hcm/console have separate APIs.
- marketing has no core NestJS API by default.
