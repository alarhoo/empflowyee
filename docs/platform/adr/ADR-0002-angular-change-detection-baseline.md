# ADR-0002: Keep Zone.js During Initial Angular 22 Foundation

- Status: Accepted
- Date: 2026-09-21

## Context

Angular 22 supports and defaults toward zoneless operation. empFLOWyee also depends on large third-party enterprise UI ecosystems.

## Decision

Generate Account, HCM, and Console with `zoneless=false` initially.

Use Signals and Signal Forms for new application state/forms regardless.

## Rationale

This isolates application modernization from third-party component compatibility risk. Zoneless adoption will be revisited after verified browser/E2E coverage of the approved HCM, Account, and Console component stacks.

## Exit criteria

A future ADR may switch to zoneless only after compatibility and visual/interaction regression tests pass for critical components and floorplans.
