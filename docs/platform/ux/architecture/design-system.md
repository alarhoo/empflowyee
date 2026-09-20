# Design System Architecture

## Shared semantic tokens

The platform owns semantic design concepts, not framework-specific component CSS.

Initial token families:

```text
brand.primary
brand.on-primary
surface.base
surface.raised
text.primary
text.secondary
border.default
state.success
state.warning
state.error
focus.ring
```

Each product maps these semantic concepts into its chosen UI system.

## Framework adapters

- HCM -> SAP/UI5 CSS variables and Fundamental theming
- Account -> Spartan/Tailwind theme tokens
- Console -> PrimeUIX/PrimeNG design tokens
- Marketing -> independent marketing token implementation

## Rule

A platform token must represent a true cross-product semantic concept. Do not add component-specific tokens to platform solely to make two frameworks look pixel-identical.
