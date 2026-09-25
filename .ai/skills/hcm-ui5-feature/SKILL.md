# HCM UI5 business feature

## Non-negotiable

The feature is theme-agnostic. It does not "use HER" by adding CSS. The HCM shell applies the active theme globally.

## Procedure

1. Read approved FDD/TDD and floorplan selection.
   Apply the mandatory decision matrix below before choosing containers or writing templates. Reconcile an older TDD selection with the current approved UX instruction; do not silently retain a dialog-based detail screen.
2. Consume the explicit contract through the domain data-access library.
3. Use approved floorplan and maintained UI5/Fundamental controls.
4. Bind real API data and real loading/error/empty states.
5. Do not create fake UI5 controls or business fixture arrays.
6. Do not add raw brand colors, HER/Horizon imports, theme classes or deep Shadow DOM CSS.
7. A genuine UX capability gap requires TDD approval and belongs in shared UX/floorplan code, not hidden in the feature.

## Mandatory UX decision matrix

| User task                                                                    | Required composition                                                                                                                                                                        | Overlay boundary                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Find an item and inspect meaningful object details                           | Native FlexibleColumnLayout with the filter/list in the begin (`startColumn`) column and an approved Object Page or page-backed detail in the mid column; selection is routed/deep-linkable | Never put the object detail screen in a dialog               |
| Small focused create, edit or action                                         | Maintained native dialog with a bounded form, clear target and explicit confirm/cancel                                                                                                      | No multi-section object workspace or large permission editor |
| Complex creation/editing with many fields, sections or substantial selection | Dedicated routed Page, Dynamic Page or approved Object Page composition with persistent actions and dirty-leave protection                                                                  | Do not stretch a dialog to simulate a page                   |
| Ordered, gated process                                                       | Approved native/composed wizard on a dedicated route                                                                                                                                        | Do not implement wizard navigation in ad hoc dialogs         |

Business features consume approved NATIVE/COMPOSED floorplans and maintained controls. They must not invent custom CSS, imitation controls, layout engines or theme behavior. Every FCL content column is page-backed with its own header. Apply the shared canvas once at the application boundary. If a selected floorplan has an unresolved acceptance gate, resolve the shared foundation gate before feature adoption; compilation is not approval.

Read the authoritative [selection standard](../../../docs/platform/ux/floorplans/selection-standard.md), [HCM floorplan catalog](../../../docs/hcm/ux/floorplans/README.md) and [page layout standard](../../../docs/hcm/ux/page-layout.md). Keep business ownership independent of the screen: contextual sections consume their owning domain's contracts/services instead of creating a second writer.

## Mandatory native interaction rules

- Business content uses maintained UI5 Web Components. Use `ui5-form`, `ui5-form-item`, `ui5-label` and `ui5-text` for object properties; HTML `dl`/`dt`/`dd`, imitation controls and custom business-layout CSS are forbidden. Native HTML is retained only for a demonstrated capability gap or a required browser primitive, documented in the TDD.
- DynamicPage filters use the native Form responsive grid. Set `labelSpan="S12 M12 L12 XL12"` so labels remain above controls at every size. Do not simulate the grid with CSS.
- Master tables expose whole-row pointer/keyboard navigation through native `ui5RowClick`, plus the maintained row navigation action. Do not add a textual View button as the sole route to detail. Mutation buttons must not also activate row navigation.
- FCL detail pages expose Close and Maximize/Minimize in the native title navigation toolbar. Close delegates to the feature route/dirty guard and is distinct from a business command such as Close review.
- Every business application has a shell Back action to its originating launchpad Space/Page. Preserve selection when the lazy launchpad is recreated.
- Shell profile, settings, notifications and product switching use the installed native controls and existing domain services; do not duplicate preference/notification business logic in shell.

## Mandatory semantic control selection

Choose the component for the meaning of the data, not merely a native wrapper that can display text. Inspect the installed wrapper API before composing a screen.

| Data or interaction                                     | Required maintained control                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Email, telephone or navigable web address               | UI5 Link with `mailto:`, `tel:` or validated HTTP(S) destination; retain a readable label and independent row actions. Do not render known contact destinations as plain text.                                                                                                                                                                                                                         |
| Business status, outcome, availability or enabled state | Fundamental `ObjectStatusComponent` with `inverted=true`, a meaningful label and domain-appropriate semantic status. Positive means success/active, negative means failure/denied, critical means attention, informative means informational, neutral means inactive/unknown. Never communicate meaning by color alone or invent feature colors. Its native `span fd-object-status` host is permitted. |
| Calendar date                                           | UI5 DatePicker, preserving a timezone-free `yyyy-MM-dd` API value.                                                                                                                                                                                                                                                                                                                                     |
| Timestamp input                                         | UI5 DateTimePicker with explicit API value format and timezone semantics; preserve invalid-input validation. A text box with a date placeholder is not acceptable.                                                                                                                                                                                                                                     |
| Date/time output                                        | Shared account-preference formatter. Do not print raw ISO timestamps or use a fixed Angular DatePipe format. Calendar dates must not shift across timezones.                                                                                                                                                                                                                                           |
| Grouped permission display/selection                    | UI5 List with ListItemGroup and standard list items; use native multiple selection for editing and nonselectable rows for read-only detail. Do not compose checkbox paragraphs. Preserve hidden selections when filtering.                                                                                                                                                                             |
| Table/list sorting                                      | A native toolbar opening UI5 ViewSettingsDialog. Filters narrow the result set; sorting orders it and must not appear as a filter field. Only expose supported fields and directions; query execution remains feature/data-access-owned.                                                                                                                                                               |

Preferences must show truthful save feedback, apply to visible values, survive reload according to their storage contract, and report storage failures. Notification badges and their tray use the same unread scope; acknowledged read actions update both. Read history belongs to an explicit All/Read view, not the default unread tray. Do not infer permission to delete messages or introduce external delivery channels.

## Current validation scope

Storybook work is on hold by explicit product direction. Do not create, repair or run stories for current HCM feature delivery. Do not repeat the established four-theme matrix for every screen that simply consumes maintained native controls. Run focused behavior, accessibility/responsive checks for changed interactions plus affected lint, tests and production build. A later explicit request may resume the workshop.
