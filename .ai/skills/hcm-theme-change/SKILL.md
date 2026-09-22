# Skill — HCM theme change

Use when changing Horizon/HER palettes, tenant accent behavior, theme selection, or theme-related HCM styles.

## Read first

- `docs/hcm/architecture/shell/theming.md`
- `docs/hcm/adr/ADR-0002-her-theme-as-horizon-overlay.md`
- the current theme library source

## Rules

1. Do not deep-style UI5 shadow DOM.
2. Do not replace native Horizon controls with custom lookalikes merely for color control.
3. Preserve semantic tokens; features must not hard-code HER/Horizon palette values.
4. Tenant branding may provide data values only, never CSS/JS.
5. Validate contrast implications for foreground/accent changes.
6. Keep light/dark variants paired unless the requirement explicitly applies to one only.
7. Update Theme Lab before accepting the change.
8. Run affected lint/test/build and visually inspect all Theme Lab previews.

## Stop conditions

Stop and propose an ADR if the request requires a complete custom UI5 theme package, non-public UI5 internals, arbitrary tenant CSS, or theme-dependent business logic.
