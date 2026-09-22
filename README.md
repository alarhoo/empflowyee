# empFLOWyee HCM UX Foundation Lab v2.0.0

The HCM UX foundation includes a lazy-loaded developer lab built from real UI5 Web Components/Fundamental NGX controls. Use the [lab maintainer guide](docs/hcm/ux/theme-lab/README.md) for operation, source ownership, theme editing and runtime configuration.

## Developer setup

Use Node 24.21.0 and pnpm 12.5.1, as pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev:hcm --host=127.0.0.1
```

Open [http://127.0.0.1:4302/ux/theme-lab](http://127.0.0.1:4302/ux/theme-lab). Home summarizes the presentation; Demo opens Employee, Leave and Projects; Settings edits the four themes and governed HER tokens. The lab uses fictional local data. Its runtime flag defaults to off in PROD.

Repository guidance: [engineering constitution](AGENTS.md), [documentation index](docs/README.md), [HCM UX](docs/hcm/ux/README.md), [CI/CD](docs/platform/engineering/cicd.md), [container strategy](docs/platform/adr/ADR-container-runtime-strategy.md).

The Theme Lab is not Storybook and is not a separate design system. It is an in-product developer playground that proves:

- native UI5 enterprise controls and layouts,
- the HCM shell/navigation model,
- Horizon Light / Horizon Dark,
- HER Light / HER Dark,
- tenant primary-color branding,
- responsive Flexible Column Layout behavior,
- a realistic My Profile / Employee experience containing the major control categories used by HCM.

## Architectural decisions

1. Use current official UI5 Web Components documentation as the capability source of truth.
2. At implementation time, verify that the repository package version exposes the selected control/import. If not, align the dependency version; do not create a fake replacement.
3. Prefer native UI5 Web Components / maintained Angular wrappers.
4. Do not reproduce UI5 controls in custom HTML/CSS.
5. Use `ui5-navigation-layout` as the first choice for the ToolPage-like shell because current UI5 Web Components provides header + SideNavigation + content natively.
6. Use `ui5-flexible-column-layout` for list-detail-detail demos.
7. Use a composed Object Page pattern only if the Angular UI5/Fundamental stack still lacks a production-ready Object Page implementation.
8. The supplied HER SCSS remains the starting palette and is included unchanged under `reference/her-theme/`.
9. The Theme Lab may ship in the same build, but runtime configuration must disable access in PROD by default.

## Target UX

```text
ShellBar
├── brand / product title
├── search / notifications
└── profile

TabContainer
├── Home
│   ├── purpose
│   ├── theme status
│   ├── control coverage status
│   └── known issues / accessibility status
│
├── Demo
│   └── NavigationLayout (ToolPage-like)
│       ├── SideNavigation
│       │   ├── Employee
│       │   ├── Leave
│       │   └── Projects
│       │
│       └── content
│           └── FlexibleColumnLayout
│               ├── begin: list/search/filter
│               ├── mid: detail / profile
│               └── end: contextual sub-detail
│
└── Settings
    ├── theme selector
    ├── semantic token editor
    ├── tenant primary color
    ├── density / direction / locale preview
    ├── reset
    └── export/import token overrides
```

Implementation requirements: [FDD](docs/hcm/fdd/FDD-HCM-UX-FOUNDATION-LAB.md), [TDD](docs/hcm/tdd/TDD-HCM-UX-FOUNDATION-LAB.md), [accepted ADR](docs/hcm/adr/ADR-HCM-UX-FOUNDATION-LAB-v2.md). Review the [control coverage](docs/hcm/ux/theme-lab/CONTROL-COVERAGE.md) and [acceptance record](docs/hcm/ux/theme-lab/ACCEPTANCE-CRITERIA.md) before extracting a reusable production pattern. The [implementation prompt](CODEX-IMPLEMENTATION-PROMPT.md) records the milestone scope.

### Reusable HCM floorplan pilots

All HCM screens follow the [page/header/footer and centered-width standard](docs/hcm/ux/page-layout.md). Run `pnpm ux:check-pages` to check native headers and FCL column structure. HTML uses repository Prettier settings with format-on-save configured for VS Code; see [formatting and editor setup](docs/platform/engineering/code-style.md).

The Foundation Lab consumes two reusable libraries: [Object Page](libs/hcm/web/ux/floorplans/object-page/README.md) and [ToolPageLayout](libs/hcm/web/ux/floorplans/tool-page-layout/README.md). They own domain-neutral composition over native UI5 components; the lab owns fictional records and local feature actions. Open `/ux/theme-lab`, choose Demo, and select an employee to exercise both. Switch themes from the shell avatar menu; compact density is the default. See the [lab guide](docs/hcm/ux/theme-lab/README.md) for review and adoption requirements.
