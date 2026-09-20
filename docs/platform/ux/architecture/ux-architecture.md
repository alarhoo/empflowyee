# UX Architecture

empFLOWyee uses one cross-product UX specification with product-specific component implementations.

```text
Platform UX specification
       |
       +--> HCM: Fundamental NGX / UI5 Web Components
       +--> Account: Spartan
       +--> Console: PrimeNG
       `--> Marketing: independent Next.js brand experience
```

## Principle

Share UX behavior, terminology, design tokens, and floorplan specifications. Do not force one component implementation across unrelated UI frameworks.

## UI hierarchy

```text
Design tokens
   -> product theme adapter
      -> approved component library
         -> floorplan/composition
            -> domain UI
               -> feature
```

## Fiori influence

HCM and the enterprise portals use Fiori-like information hierarchy and enterprise interaction guidelines where appropriate. This does not mean visually cloning SAP or recreating existing SAP components manually.

## Reuse policy

For every UI requirement:

1. use a maintained native library capability when it satisfies the UX specification;
2. compose approved library primitives when needed;
3. create empFLOWyee-owned UI/floorplan code only when the first two options cannot satisfy the requirement.
