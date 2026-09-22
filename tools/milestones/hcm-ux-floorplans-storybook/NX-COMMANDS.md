# Nx materialization commands

Historical materialization record for Nx 23.2.1. Both generator help commands and both prerequisite UX checkers were run before generation. These projects now exist; do not rerun generators over maintained source.

## 1. Storybook on the existing HCM app

```bash
pnpm nx g @nx/angular:storybook-configuration --help
pnpm nx g @nx/angular:storybook-configuration hcm-web \
  --generateStories=false --interactionTests=true --configureStaticServe=true \
  --tsConfiguration=true --linter=eslint --skipFormat=true --no-interactive
```

Enable interaction tests if the installed generator exposes the option and the generated setup remains on supported Storybook 10 packages.

Do not manually switch to `@storybook/angular-vite` in this milestone.

## 2. Composed floorplan libraries

```bash
pnpm nx g @nx/angular:library libs/hcm/web/ux/floorplans/object-page \
  --name=hcm-web-ux-floorplan-object-page \
  --importPath=@empflowyee/hcm-web-ux-floorplan-object-page \
  --standalone=true --strict=true --style=scss --prefix=ef-hcm --flat=true \
  --linter=eslint --unitTestRunner=vitest-analog --skipPackageJson=true \
  --skipFormat=true --no-interactive \
  --tags=product:hcm,runtime:web,domain:ux,type:floorplan

pnpm nx g @nx/angular:library libs/hcm/web/ux/floorplans/list-report \
  --name=hcm-web-ux-floorplan-list-report \
  --importPath=@empflowyee/hcm-web-ux-floorplan-list-report \
  --standalone=true --strict=true --style=scss --prefix=ef-hcm --flat=true \
  --linter=eslint --unitTestRunner=vitest-analog --skipPackageJson=true \
  --skipFormat=true --no-interactive \
  --tags=product:hcm,runtime:web,domain:ux,type:floorplan

pnpm nx g @nx/angular:library libs/hcm/web/ux/floorplans/worklist \
  --name=hcm-web-ux-floorplan-worklist \
  --importPath=@empflowyee/hcm-web-ux-floorplan-worklist \
  --standalone=true --strict=true --style=scss --prefix=ef-hcm --flat=true \
  --linter=eslint --unitTestRunner=vitest-analog --skipPackageJson=true \
  --skipFormat=true --no-interactive \
  --tags=product:hcm,runtime:web,domain:ux,type:floorplan

pnpm nx g @nx/angular:library libs/hcm/web/ux/floorplans/overview-page \
  --name=hcm-web-ux-floorplan-overview-page \
  --importPath=@empflowyee/hcm-web-ux-floorplan-overview-page \
  --standalone=true --strict=true --style=scss --prefix=ef-hcm --flat=true \
  --linter=eslint --unitTestRunner=vitest-analog --skipPackageJson=true \
  --skipFormat=true --no-interactive \
  --tags=product:hcm,runtime:web,domain:ux,type:floorplan

pnpm nx g @nx/angular:library libs/hcm/web/ux/floorplans/analytical-list-page \
  --name=hcm-web-ux-floorplan-analytical-list-page \
  --importPath=@empflowyee/hcm-web-ux-floorplan-analytical-list-page \
  --standalone=true --strict=true --style=scss --prefix=ef-hcm --flat=true \
  --linter=eslint --unitTestRunner=vitest-analog --skipPackageJson=true \
  --skipFormat=true --no-interactive \
  --tags=product:hcm,runtime:web,domain:ux,type:floorplan
```

## 3. Forms and tables

```bash
pnpm nx g @nx/angular:library libs/hcm/web/ux/forms \
  --name=hcm-web-ux-forms \
  --importPath=@empflowyee/hcm-web-ux-forms \
  --standalone=true --strict=true --style=scss --prefix=ef-hcm --flat=true \
  --linter=eslint --unitTestRunner=vitest-analog --skipPackageJson=true \
  --skipFormat=true --no-interactive \
  --tags=product:hcm,runtime:web,domain:ux,type:ui

pnpm nx g @nx/angular:library libs/hcm/web/ux/tables \
  --name=hcm-web-ux-tables \
  --importPath=@empflowyee/hcm-web-ux-tables \
  --standalone=true --strict=true --style=scss --prefix=ef-hcm --flat=true \
  --linter=eslint --unitTestRunner=vitest-analog --skipPackageJson=true \
  --skipFormat=true --no-interactive \
  --tags=product:hcm,runtime:web,domain:ux,type:ui
```

## 4. Verify

```bash
pnpm nx graph
pnpm nx run-many -t lint test --projects='hcm-web-ux-*'
pnpm nx build-storybook hcm-web
```

Run the exact commands reported by `nx show project hcm-web` if target names differ.

All seven libraries use the official standalone Angular library generator. Its non-buildable library setup uses Vitest Analog; the installed vitest-angular generator choice requires a buildable library. Production consumers compile library source. Separate story configs include fixtures for linting while excluding them from production builds.

## Approved correction: Dynamic Page production contract

After rerunning both prerequisite scripts and inspecting `@nx/angular:library --help`, the following official generator created the justified production state/action composition. It is not a native API alias. Object Page reuses its existing library.

```bash
pnpm nx g @nx/angular:library libs/hcm/web/ux/floorplans/dynamic-page --name=hcm-web-ux-floorplan-dynamic-page --importPath=@empflowyee/hcm-web-ux-floorplan-dynamic-page --tags=product:hcm,runtime:web,domain:ux,type:floorplan --prefix=ef-hcm --style=scss --unitTestRunner=vitest-analog --linter=eslint --skipFormat --skipPackageJson --skipTests
```

Scaffold code was replaced with the production contract and focused tests. The earlier commands above are historical; their output count does not establish canonical approval.
