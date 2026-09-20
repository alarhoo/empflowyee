# empFLOWyee Floorplan Catalog

Floorplans are UX specifications. A floorplan may be implemented by a native library component, a composition of approved primitives, or an empFLOWyee-owned component.

## Status values

- `SPEC_PENDING` — definition still required
- `RESEARCH` — capability matrix not yet complete
- `NATIVE` — chosen library provides a suitable maintained implementation
- `COMPOSED` — implemented by composing approved primitives
- `EMPFLOWYEE` — custom reusable implementation approved

## Initial catalog

| ID | Floorplan | Typical use | Status |
| --- | --- | --- | --- |
| UX-FP-DYNAMIC-PAGE | Dynamic Page | header + content + actions | RESEARCH |
| UX-FP-OBJECT-PAGE | Object Page | rich business object display/edit | RESEARCH |
| UX-FP-FLEXIBLE-COLUMN | Flexible Column | master/detail/multi-object flows | RESEARCH |
| UX-FP-LIST-REPORT | List Report | searchable/filterable object collection | RESEARCH |
| UX-FP-WORKLIST | Worklist | task-oriented operational list | RESEARCH |
| UX-FP-WIZARD | Wizard | guided multi-step process | RESEARCH |
| UX-FP-OVERVIEW | Overview | cards/KPIs/entry points | RESEARCH |
| UX-FP-ANALYTICAL-LIST | Analytical List | analysis + filtering + drill-down | RESEARCH |
| UX-FP-DASHBOARD | Dashboard | role-specific monitoring | RESEARCH |
| UX-FP-FORM | Form Page | focused create/edit flow | RESEARCH |
| UX-FP-CALENDAR | Calendar/Planning | time-oriented planning | RESEARCH |
| UX-FP-TIMELINE | Timeline | chronological business history | RESEARCH |
| UX-FP-TASK-INBOX | Task/Inbox | approval/workflow tasks | RESEARCH |

The catalog is intentionally extensible. A new feature must reference an approved floorplan ID in its FDD/TDD rather than inventing layout ad hoc.
