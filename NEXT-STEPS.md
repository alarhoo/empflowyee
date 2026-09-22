# After this milestone

The HCM Shell + Theme Lab is implemented locally. Use the [maintainer guide](docs/hcm/architecture/shell/README.md)
and [TDD](docs/hcm/tdd/TDD-HCM-SHELL-THEME-LAB.md) for its scope and validation. Promote it to DEV through
the normal reviewed build/manual deployment process when ready; the historical DEV release still contains the scaffold.

The next product milestone is **HCM UX Floorplan Foundation**.

Sequence:

1. Build the component-capability matrix against current UI5 Web Components / Fundamental NGX.
2. Create the approved floorplan catalog and production implementations/adapters only where the library does not already provide them.
3. Add Storybook for HCM UX/floorplan libraries.
4. Implement and visually test at least:
   - Dynamic Page
   - Object Page composition
   - Flexible Column Layout
   - List Report
   - Worklist
   - Wizard
   - Overview Page
   - enterprise form pattern
   - client/server table pattern
5. Add responsive/accessibility/empty/loading/error/read-only states.
6. Only then choose the first real HCM domain feature for an end-to-end FDD → TDD → implementation vertical slice.

Do not jump straight to Payroll/Leave implementation before the UX primitives and shell contract are proven.
