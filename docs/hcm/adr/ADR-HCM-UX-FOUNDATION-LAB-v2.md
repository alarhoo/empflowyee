# ADR — HCM UX Foundation Lab v2

## Status
Accepted.

## Context
Earlier Theme Lab and Storybook work created approximated Fiori/UI5 layouts using custom HTML/CSS. That was the wrong abstraction. The product needs a reliable way to validate native enterprise controls, HCM shell composition, custom HER themes and tenant branding before business features are built.

## Decision
Create one HCM UX Foundation Lab as a lazy-loaded feature of `hcm-web`.

The lab must use actual production controls and production theming services. It is a developer tool, not a parallel UI implementation.

The primary shell/layout stack is:

- UI5 `ShellBar`
- UI5 `TabContainer`
- UI5 `NavigationLayout`
- UI5 `SideNavigation`
- UI5 `FlexibleColumnLayout`
- UI5 `DynamicPage` / `Page` where appropriate
- UI5 `Form`, `Table`, `Timeline`, `UploadCollection`, dialogs/popovers and other real controls

The approved ToolPageLayout pilot wraps maintained `NavigationLayout` under an empFLOWyee name; it does not implement a competing navigation engine. Object Page composes maintained DynamicPage and TabContainer. Both implementations live under `libs/hcm/web/ux/floorplans` and are consumed by Theme Lab. This placement supersedes the original lab-first extraction restriction. Feature adoption still requires visual and accessibility review.

## Consequences
- Fewer custom controls.
- Theme validation happens against real UI5 behavior.
- HER theme work is measurable.
- The lab becomes a strong visual foundation for later FDD/TDD work.
- Storybook is not required for this milestone.
