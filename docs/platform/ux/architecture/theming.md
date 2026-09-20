# Theming Strategy

## HCM

Theme stack:

```text
Base UI5 theme
  - Horizon Light
  - Horizon Dark
        |
empFLOWyee custom theme family
  - HER Light
  - HER Dark
        |
Tenant brand overlay
  - approved primary color
  - logo / brand assets
  - derived accessible semantic colors
```

UI5 Web Components use SAP CSS variables, allowing controlled custom themes and runtime theme changes. HER themes must be implemented through theme/design tokens rather than ad-hoc per-component CSS overrides.

Tenant primary color is a runtime brand input, not an unrestricted theme editor. The platform derives hover/active/selected/focus/on-primary colors and validates contrast.

## Account

Account owns an empFLOWyee light/dark theme built with Spartan/Tailwind conventions. HER-inspired variants are allowed under the same semantic token model.

## Console

Console owns an empFLOWyee light/dark theme based on PrimeNG/PrimeUIX design tokens. HER-inspired variants are allowed.

## Marketing

Marketing can have an independent brand experience and is not required to follow enterprise application floorplans.
