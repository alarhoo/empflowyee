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

The current reusable pilots are Object Page and ToolPageLayout under `libs/hcm/web/ux/floorplans`. Object Page composes native UI5 DynamicPage and TabContainer for tabbed sections. This supersedes the earlier Core DynamicPage + Platform IconTabBar stacked-section implementation. The maintained Platform alternative remains documented capability evidence; this decision selects a tabbed detail pattern without claiming that Angular lacks object-page building blocks.

ToolPageLayout is an empFLOWyee naming integration over native NavigationLayout. Thin naming wrappers are allowed when native rendering, interactions and accessibility are retained. Custom layout engines and HTML/CSS imitations remain prohibited where maintained controls suffice. Theme Lab supplies feature content and consumes both reusable pilots; Storybook renders the same production libraries. Visual approval governs feature adoption rather than whether the library exists. Additional floorplan work is deferred.


Horizon Light without a tenant override and compact density are the initial developer-tool presentation. The Theme Lab avatar menu exposes all four variants. HER remains a preserved semantic overlay over the corresponding Horizon base.

## Consequences

- we avoid maintaining clones of SAP controls
- floorplan APIs remain business-domain agnostic
- native component upgrades remain accessible
- our custom maintenance surface is limited to actual gaps
