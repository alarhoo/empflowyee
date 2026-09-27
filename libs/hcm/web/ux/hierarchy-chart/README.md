# hcm-web-ux-hierarchy-chart

Shared connected hierarchy: D3 computes coordinates; native UI5 cards, avatars and
buttons retain their own semantics and interactions. This library owns no domain
DTOs, HTTP calls or permission decisions. Callers provide only visible nodes and
handle selection, expansion and pagination outputs.

The approved chart-specific layout exception and installed capability inspection
are recorded in [Org Chart design](../../../../../docs/hcm/apps/org-chart/TDD.md#connected-chart-composition).
Chart CSS is limited to coordinates, connectors, scrolling and scaling with semantic
theme tokens. Tree view remains available in the consuming feature.

Generated with `nx g @nx/angular:library libs/hcm/web/ux/hierarchy-chart
--name=hcm-web-ux-hierarchy-chart --importPath=@empflowyee/hcm-web-ux-hierarchy-chart
--prefix=ef-hcm --tags=product:hcm,runtime:web,domain:ux,type:ui --style=scss
--unitTestRunner=vitest-analog --skipTests --skipFormat --skipPackageJson`.

## Running unit tests

Run `nx test hcm-web-ux-hierarchy-chart` to execute the unit tests.
