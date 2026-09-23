# HCM launchpad feature

Lazy catalogue-backed root screen, owned by navigation independently of the global shell.
Consumes runtime session/navigation intents and pure catalogue projection. Owns Space/Page
selection, native tiles, search results and one shared planned/unavailable dialog.

The route uses the approved full-bleed native Page with a centered content frame.
Presentation styling belongs to the shared UX theme foundation. No business implementation
or theme implementation is imported here.

See [the launchpad design](../../../../../docs/hcm/tdd/TDD-HCM-0-LAUNCHPAD.md).

Run `pnpm nx lint hcm-web-navigation-feature-launchpad` and
`pnpm nx test hcm-web-navigation-feature-launchpad`.
