# HCM page layout standard

Every screen needs a page container with a header and an optional footer. Use the installed native UI5 Page or DynamicPage, or the shared Object Page composition. Lists, tables and forms are page content; they do not replace the page itself.

## Content ownership

- Native Page supplies a `header` slot and optional `footer` slot. Project native Bar with a meaningful title and relevant page actions.
- Native DynamicPage supplies `titleArea`, optional collapsible `headerArea` and optional `footerArea`. UI5 owns header behavior, scrolling and footer placement.
- `HcmObjectPage` provides title, actions, section templates and header regions. Set `showFooter` and project `[hcmFooter]` content when a feature needs a footer. The footer is shown only in the content state. The feature owns its actions and editability.
- ToolPageLayout owns workspace navigation and its workspace header. Its content still needs a Page or a native FCL containing pages. A workspace header does not replace a column's page header.
- Every occupied FCL start/mid/end column has its own Page, DynamicPage or component backed by one. LabProfile is backed by shared Object Page, so adding another enclosing Page would be redundant.
- Forms, tables, tabs and cards inside a page do not each need another Page. Dialogs, menus and popovers retain their maintained overlay anatomy.

The employee directory, leave list and project list use Page with title and sort actions in its header. Home and Settings also have native page headers. Employee detail consumes Object Page; related detail columns use native Page. Business features must follow the same rule.

## Centered application canvas

The shared `.hcm-app-canvas` class caps HCM at **90rem (1440px at the default root font size)** and centers it with equal logical margins. Responsive side gutters range from **0.5rem to 2rem**. The rule lives in `libs/hcm/web/ux/theme/src/lib/styles/_hcm-theme-layout.scss` and is applied to the HCM application root and Storybook theme frame.

Apply this frame once. Nested pages and FCL columns use the available container width; do not repeat the maximum width or add independent outer gutters per feature. This keeps shell, navigation, headers, content and footer aligned on large displays. Phone content remains fluid within its small gutters. Other products retain their own UI architecture and layout decisions.

Use native responsive behavior and public host sizing. Do not deep-style Shadow DOM internals or replace FCL with a CSS grid.

## Checks and editor setup

```sh
pnpm ux:check-pages
node --test tools/ux/page-structure.test.mjs
pnpm exec ngc --noEmit -p libs/hcm/web/ux/feature-theme-lab/tsconfig.lib.json
pnpm exec prettier --check "apps/**/*.html" "libs/**/*.html"
```

The page-structure check runs in PR CI. It parses external and inline HCM component templates, requires native page headers, and resolves local component hosts to reject bare lists/forms/tables in FCL columns. Review must also verify that routed screens use page containers and headers have meaningful titles. Browser checks verify the shared width limit and equal gutters at 2560, 1440, 768 and 390px, alongside the four themes.

Custom Angular components must be exported from their library entry point and present in the consuming standalone component's `imports`. Story files need a referenced story tsconfig. Angular template diagnostics are separate from ESLint; do not add `CUSTOM_ELEMENTS_SCHEMA` or `NO_ERRORS_SCHEMA` to conceal missing imports. If a successful strict compiler check disagrees with VS Code after generating a library, run **Angular: Restart Angular Language server** to discard stale project resolution.

See the [floorplan API guide](floorplans/README.md), [Theme Lab guide](theme-lab/README.md) and [formatting standard](../../platform/engineering/code-style.md).
