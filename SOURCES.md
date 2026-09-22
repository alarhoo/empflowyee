# HCM milestone implementation references

Architecture and policy are owned by the repository's [HCM documentation](docs/hcm/README.md). The installed package declarations/source were inspected on 2026-09-22: Nx 23.2.1, Angular 22.1.7, Fundamental NGX 0.64.3 and UI5 Web Components 2.26.0.

Use these primary references when upgrading or maintaining the integration:

- [UI5 configuration and theme assets](https://ui5.github.io/webcomponents/docs/advanced/configuration/) — register Assets and switch the native base with `setTheme`.
- [UI5 styling](https://ui5.github.io/webcomponents/docs/advanced/styles/) — public CSS theming parameters.
- [UI5 theme designer](https://ui5.github.io/webcomponents/docs/advanced/theming/) — separate future option; the current HER overlay is not a full custom theme.
- [Fundamental NGX source](https://github.com/SAP/fundamental-ngx) — maintained Angular wrappers; current implementation uses Button, Input, CheckBox and ShellBar secondary entry points.
- [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) — signal model and native field binding used by the hex-color editor.
- [Nx Angular library generator](https://nx.dev/nx-api/angular/generators/library) — generated project metadata and supported test runners.

The precise accent parameter allowlist, palette integrity hash and contrast behavior are documented in [HCM theming](docs/hcm/architecture/shell/theming.md). Recheck the installed APIs, generated configuration and browser behavior when dependencies change.
