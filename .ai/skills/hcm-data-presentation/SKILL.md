# HCM semantic data presentation

Use whenever HCM business data is rendered or edited.

## Principle

Choose controls from the meaning of the data. Do not render everything through generic text, generic inputs, or custom HTML because it is faster.

## Required mappings

- Email -> maintained UI5 Link with `mailto:`.
- Telephone -> maintained UI5 Link with `tel:`.
- Navigable URL -> maintained UI5 Link with validated HTTP(S) destination.
- Business status/state/outcome -> Fundamental `ObjectStatusComponent` with `inverted=true` and the correct semantic status. Never rely on color alone.
- Calendar-date input -> UI5 DatePicker with a timezone-free API date value.
- Date-time input -> UI5 DateTimePicker/equivalent maintained control with explicit timezone semantics.
- Date/time display -> shared locale/account-preference formatter; never raw ISO strings.
- Boolean -> CheckBox for explicit yes/no data; Switch for immediate on/off settings. TDD decides when ambiguous.
- Fixed enum -> Select. Searchable/large enum -> ComboBox. Do not use free-text Input for constrained values.
- Multi-value input -> MultiInput/tokens or the approved maintained multi-selection control.
- Long text -> TextArea.
- Person/user reference -> approved person identity presentation; use Avatar when the FDD benefits from identity recognition.
- Files/documents -> maintained upload/document controls; do not imitate file pickers.
- Tables -> maintained UI5 table/list controls and the enterprise-table skill.

## Detail and create interaction

- Rich list -> detail navigation uses FlexibleColumnLayout where simultaneous master/detail context is valuable.
- Rich object detail uses an approved page-backed Object Page/detail floorplan with sections.
- A dialog is for a small, focused action or short create/edit form with no need for sections, deep linking, or extended context.
- A create/edit flow with many fields, sections, collections, or long-lived state uses a dedicated route/page.
- A staged multi-step business process uses the approved wizard/dedicated-route pattern.
- Dialogs are never substitutes for rich object-detail pages.

## Prohibited

- HTML `dl`/`dt`/`dd` for business-detail layouts.
- Native/generic `<input>`, `<select>`, or `<textarea>` when a maintained semantic UI5/Fundamental control exists.
- Plain-text email/telephone/URL when the value is actionable.
- Feature-specific status colors or raw brand colors.
- Theme-specific business code or feature CSS for ordinary presentation.

When a maintained control cannot meet an approved requirement, document the capability gap in the TDD and solve it in shared UX ownership rather than ad hoc feature CSS.
