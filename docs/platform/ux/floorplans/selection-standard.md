# Floorplan selection standard

The FDD describes the user's task and information hierarchy. The TDD records the chosen floorplan ID.

The TDD also names an approved production implementation, its maintained imports and any demonstrated composition gap. Check native capabilities, maintained framework integration, supported composition, then custom implementation. Storybook must render that same production export. Do not select a deferred candidate merely because it appears in the behavioral catalog.

## Selection heuristics

- **Standard Page** — bounded, simple content; no complex header or multi-object navigation.
- **Dynamic Page** — a persistent title/actions area plus contextual header that may collapse while scrolling.
- **Flexible Column Layout** — preserve list/detail context while navigating one or two levels deeper.
- **Wizard** — ordered, gated steps where users should complete a process progressively.
- **Object Page** — display/edit one business object with several semantically grouped sections and actions.
- **List Report** — users primarily find/filter/sort a collection and act on results.
- **Worklist** — focused queue of tasks/items with immediate action and status emphasis.
- **Overview Page** — role-based summary of several independent topics/cards.
- **Analytical List Page** — users need both analytical signals and the underlying detailed result set.

## Mandatory HCM decisions

For HCM, list-detail tasks with meaningful object information require native FlexibleColumnLayout: the filter/list remains in the begin column and selection opens an Object Page or approved detail page in the mid column. Selection must be deep-linkable. Every occupied column has a native/approved page and header.

Native dialogs are restricted to small focused create/edit/action flows. Complex creates or edits with many fields or sections require a dedicated routed page with dirty-leave protection. Ordered wizard processes use an approved wizard on a dedicated route. Business features consume approved native/composed floorplans and must not invent custom CSS; genuine capability gaps are resolved in shared UX with documented evidence and acceptance checks.

## TDD declaration

```yaml
ux:
  floorplan: UX-FP-OBJECT-PAGE
  mode: display-edit
  tableMode: server
  responsive: true
```

Do not choose a floorplan based only on visual preference. If no approved pattern fits, document the UX gap before creating a new one.
