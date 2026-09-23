# HCM-0 launchpad validation

Verified locally on 2026-09-23 against the current canonical catalogues. The
engineering factory was not reinstalled and the folder materializer was not run.
No business app, new Nx project, database table or production authentication was
introduced. This extends the earlier production-shell foundation evidence.

## Runtime evidence

- `http://acme.localhost:4302` uses the real proxy and Nest runtime endpoints to
  establish Dunder Mifflin and Jim Halpert. The live tests do not intercept APIs.
- Native profile selection replaces the server session context for Michael Scott,
  Toby Flenderson, David Wallace and Jim. Normal mode filters role placement and
  explicit discovery capabilities; inspect-all exposes five Spaces, 20 Pages and
  all 170 app identities, verified by traversing every canonical group.
- Native overflow navigation reaches long Page labels. Search finds administrative
  apps in inspection mode and excludes them from Jim's normal mode. Keyboard
  activation opens the shared Planned dialog without navigating to a placeholder.
- MY_PROFILE is Planned: no valid domain implementation or approved route exists
  in this checkout. The separate `/workspace` routing proof is excluded from the
  business inventory and denied to local personas.
- API tests exercise real local adapters, default/selected personas, unknown IDs,
  wrong-tenant membership, non-loopback peers and prohibited environments. Existing
  lifecycle, expiry, permission, entitlement and lazy-route denial tests remain.
- Eleven deterministic Chromium shell scenarios cover error/auth/lifecycle states,
  all four Horizon/HER variants, a tenant accent and its removal, native control
  accessibility, and 2560/1440/768/390px widths. The two live launchpad scenarios
  add actual local bootstrap, catalogue coverage, persona switching and search.

## Repository checks

The full Nx run passed 66 lint/test/build tasks across 38 projects. Affected checks
were repeated after the final lazy catalogue entry-point and native search changes.
Catalogue validation/generation drift, documentation, architecture, page structure,
tooling lint, repository formatting and whitespace checks passed. Existing
unrelated theme/Storybook lint warnings and the Console scaffold style-budget
warning remain; no rule or budget was relaxed.

The final HCM production initial bundle is 472.28 kB, below the existing 500 kB
warning threshold. Catalogue data loads through its separate entry point instead
of eager session validation.

## Reproduce

Start the web and API in separate terminals:

```sh
pnpm dev:hcm --host=127.0.0.1
pnpm dev:hcm-api
```

Open the local URL. Use the profile button for persona/theme selection and
**Inspect all applications**. Use the native Search action to search the visible
catalogue. Reload restores Jim; inspection and persona selection are not stored.

With both servers running:

```sh
pnpm exec playwright test --config=apps/hcm/web-e2e/local-launchpad.config.mts
pnpm exec playwright test --config=apps/hcm/web-e2e/playwright.config.mts --project=chromium src/production-shell.spec.ts --workers=2
pnpm nx run-many -t lint,test,build --parallel=3
pnpm hcm:catalogue:check
pnpm docs:check
pnpm architecture:check
pnpm ux:check-pages
pnpm lint:tooling
pnpm nx format:check --uncommitted
git diff --check
```

Screenshots/traces are local ignored artifacts under `.tmp/hcm-launchpad-browser`
and `.tmp/hcm-production-shell`. Production IdP/session persistence, cloud ingress,
database seeds and Firefox/WebKit verification are outside this milestone. See the
[local-session ADR](../adr/ADR-HCM-LOCAL-DEVELOPMENT-SESSION.md) and
[launchpad TDD](../tdd/TDD-HCM-0-LAUNCHPAD.md).

## Visual refinement verification

The landscape/glass presentation, anchored profile dropdown and separate theme toggle
were verified against the running local API. Both device schemes, persisted manual
selection after reload, email presentation, popup anchor/size, Escape/outside-click
dismissal and four consecutive persona changes passed browser checks. The existing
11 shell scenarios passed, including all four theme variants, axe accessibility,
tenant-overlay removal and responsive widths. Catalogue traversal still verifies all
170 apps. Affected Nx lint/unit/API tests and builds passed. The visual refinement
build has a 477.64 kB initial bundle, within the unchanged 500 kB warning threshold.

The shared style exception and appearance precedence are documented in the
[visual refinement design](../tdd/TDD-HCM-0-LAUNCHPAD.md#launchpad-visual-refinement).
Only reference styling and approved image assets were adapted; reference HTML and
business implementations were not copied.

## Full-width launchpad and appearance verification

The navigation-owned lazy launchpad was verified with the shell and landscape at
full viewport width and centered content capped at 90rem. Five live browser tests
pass, covering all 170 applications, five Spaces, 20 Pages, four consecutive persona
changes, all four appearance choices, reload persistence and returning to live device
mode. Actual native foreground/surface colors are checked after reload to guard the
UI5 startup palette race. The 11 production-shell browser scenarios pass with axe,
tenant-overlay removal, route denial and responsive checks.

Affected application, shell, runtime context, navigation and theme lint/unit checks,
production build, architecture, page structure, catalogue, documentation and format
checks pass. Additional browser checks cover reduced-motion hover, phone tile sizing,
the native Page's thin transparent-track scrollbar and opening My Profile from an
access-denied route. The dev server remains available at `acme.localhost:4302` with
the local API on port 4402. Local screenshots remain ignored verification artifacts.
