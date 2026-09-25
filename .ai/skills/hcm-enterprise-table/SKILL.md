# HCM Enterprise Table

## Use when

Designing or implementing a tabular HCM feature.

## Procedure

1. Read the FDD/TDD and identify required table capabilities.
2. Declare `client` or `server` data mode explicitly.
3. Verify current `ui5-table` and Fundamental wrapper APIs before coding.
4. Enable only required features (selection, growing, virtualization, etc.).
5. Keep HTTP/query execution in feature/data-access code, never in the UX table library.
6. Define loading, empty, error and responsive behavior.
7. Follow the current Storybook hold in the HCM UI5 feature skill; validate changed native table interactions without workshop work.
8. Test query-state mapping or our table orchestration; do not test UI5's own selection implementation.

Whole-row detail navigation must use native row-click and a navigation action. Preserve independent mutation actions and keyboard behavior.

Sorting belongs in the table toolbar through UI5 ViewSettingsDialog, never among filter-bar fields. Use the shared `HcmViewSettings` composition; features own supported field metadata, confirmation-to-query mapping and cursor reset. Cancel leaves the query unchanged. Bounded client collections may sort locally; server pages must never be locally reordered as though they were the full result set. Apply the UI5 feature skill's semantic rules for links, inverted object status and preference-aware date values in cells.
