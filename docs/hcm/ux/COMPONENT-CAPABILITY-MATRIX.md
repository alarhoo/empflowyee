# HCM Component and Floorplan Capability Matrix

This matrix must be completed before implementing empFLOWyee-owned floorplans.

Legend:

- `YES` — approved maintained capability exists
- `PARTIAL` — primitives exist but composition is required
- `NO` — no suitable capability identified
- `TBD` — research pending

| Capability       | UI5 Web Components wrapper                                                    | Fundamental Platform | Fundamental Core | empFLOWyee action                                         |
| ---------------- | ----------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------------------- |
| Button           | YES: `@fundamental-ngx/ui5-webcomponents/button`                              | TBD                  | TBD              | native wrapper in Theme Lab                               |
| Input            | YES: `@fundamental-ngx/ui5-webcomponents/input`                               | TBD                  | TBD              | accessible read-only fixture fields                       |
| Form             | TBD                                                                           | TBD                  | TBD              | research                                                  |
| Table            | TBD                                                                           | TBD                  | TBD              | research                                                  |
| Dynamic Page     | TBD                                                                           | TBD                  | TBD              | research                                                  |
| Flexible Column  | TBD                                                                           | TBD                  | TBD              | research                                                  |
| Object Page      | TBD                                                                           | TBD                  | TBD              | research                                                  |
| List Report      | TBD                                                                           | TBD                  | TBD              | research                                                  |
| Worklist         | TBD                                                                           | TBD                  | TBD              | research                                                  |
| Wizard           | TBD                                                                           | TBD                  | TBD              | research                                                  |
| Shell/navigation | PARTIAL: `@fundamental-ngx/ui5-webcomponents-fiori/shell-bar` and `check-box` | TBD                  | TBD              | native shell bar; semantic catalog navigation composition |

## Rule

Do not turn `TBD` into custom code. Research the maintained libraries first and record the result, supported version, relevant API, and limitations.

## Shell + Theme Lab evidence

Inspected installed Fundamental NGX 0.64.3 wrapper declarations and UI5 Web Components
2.26.0 on 2026-09-22. Wrappers expose standalone `Button`, `Input`, `CheckBox` and
`ShellBar`; imports use the individual secondary entry points. Inputs accept
`accessibleName`/`readonly`, checkboxes emit `ui5Change`, and the shell bar accepts
`primaryTitle`/`secondaryTitle`. Angular inputs use those camel-case names, not raw
web-component attribute names. See the [UI decision](UI-LIBRARY-DECISION.md).

The four layouts in Theme Lab are explicitly schematic fixtures approved by the
[milestone TDD](../tdd/TDD-HCM-SHELL-THEME-LAB.md#14-preview-scope-and-states).
They do not establish a production Object Page/FCL/Table/Form implementation or
replace the pending research rows above. Native UI5 controls retain Horizon styling;
only product surfaces and the approved emphasis parameters receive HER/accent tokens.
