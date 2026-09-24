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
