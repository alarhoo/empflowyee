# ADR-0004 — Reuse-first HCM floorplans

## Status

Accepted

## Context

The product deliberately follows Fiori-like enterprise UX. UI5 Web Components already maintain several high-value layout controls.

## Decision

Classify each approved floorplan as:

- **NATIVE** — use maintained component directly
- **COMPOSED** — create a thin empFLOWyee composition from maintained primitives
- **EMPFLOWYEE** — custom implementation only when a documented gap proves composition is insufficient

## Approved correction (2026-09-22)

The earlier fixed classifications are superseded following the installed-package audit. A catalog ID does not approve an implementation. Selection is NATIVE, maintained Angular integration, COMPOSED, then custom only for a documented gap.

The first production proof is limited to Dynamic Page and Object Page. Dynamic Page uses the maintained UI5 Angular wrappers. Object Page uses Core DynamicPage with Platform Icon Tab Bar after a browser proof of Platform DynamicPage exposed viewport-height content wrappers and large gaps between short sections. The supported primitive composition retains maintained header and section navigation without a custom scroll engine. No Angular export literally named ObjectPage exists in the installed stack; Platform's maintained equivalent must be used before considering custom scrolling or navigation.

The same production components and example hosts are consumed by Theme Lab and Storybook. Product-specific state/action conventions justify a thin floorplan composition; merely renaming a native API does not. Existing other floorplans are deferred and excluded from the canonical catalog pending individual review.

Horizon Light without a tenant override is the initial developer-tool presentation. HER remains a preserved semantic overlay over the corresponding Horizon base.

## Consequences

- we avoid maintaining clones of SAP controls
- floorplan APIs remain business-domain agnostic
- native component upgrades remain accessible
- our custom maintenance surface is limited to actual gaps
