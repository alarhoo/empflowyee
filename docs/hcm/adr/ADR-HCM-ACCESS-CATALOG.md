# ADR — HCM catalog-driven navigation and route access

## Decision

Use one canonical, compile-time HCM application catalog for Space/Page/Group/Feature metadata.

Navigation and direct-route presentation access use the same catalog entry and runtime policy evaluator.

The catalog does not import feature implementation.

## Why

- prevents navigation rules drifting from route rules
- keeps feature placement separate from domain/file ownership
- lets one feature appear in multiple navigation placements
- cleanly combines tenant entitlements and user permissions
- keeps lazy feature implementation independent

## Security

The frontend catalog is not an authorization boundary. Backend operations independently authorize every protected request.

## HCM-0 extension

The canonical JSON inventory generates the shared runtime projection. Navigation
uses explicit discovery permissions/entitlements and role placement independently
of implementation status, so Planned entries remain discoverable. Route activation
additionally requires an implemented app with an approved route. Inspection changes
visibility only. These predicates share capability evaluation without treating
visibility as business authorization. See the
[launchpad TDD](../tdd/TDD-HCM-0-LAUNCHPAD.md).
