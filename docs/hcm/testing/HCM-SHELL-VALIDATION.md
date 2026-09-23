# Production HCM shell validation

Historical foundation snapshot: the local-session and catalogue statements below
precede the HCM-0 runtime correction. Current results and reproduction commands
are in [HCM-0 launchpad validation](HCM-0-LAUNCHPAD-VALIDATION.md).

Verified locally on **2026-09-23**. This records source implementation checks, not a cloud deployment or production authentication approval.

## Results

- Affected Nx lint, unit/integration tests and application builds passed. This includes 32 tests across the runtime contract, API boundary, browser bootstrap, route guard, catalog, shell, app root and shared configuration loader.
- All 15 Chromium browser tests passed: 11 production-shell scenarios and four existing Foundation Lab regressions.
- Native shell controls passed axe checks in Horizon Light/Dark and HER Light/Dark with tenant branding. Responsive checks covered 2560, 1440, 768 and 390px, the shared 90rem canvas and horizontal overflow. Native navigation opened the lazy placeholder; forbidden direct navigation did not invoke its loader.
- A pre-auth HER presentation switched to user-selected Horizon and removed its previous tenant accent without reloading. The profile uses the maintained neutral avatar scheme to preserve contrast.
- The running Angular proxy preserved `Host: acme.localhost:4302` to the built HCM API on loopback; discovery returned HTTP 200 with the fictional safe tenant presentation. Local sessions remain unauthenticated by design.
- API HTTP tests covered safe discovery, body/query tenant override rejection, ignored forwarded hosts, 401, mismatched membership 403, suspended/deactivated 423, expiry and authenticated context. No fake session adapter is included in production code.
- Documentation, architecture, page-structure and tooling lint checks passed. `git diff --check` passed.
- The production web initial bundle is approximately **476 kB**, below the existing 500 kB warning threshold. No budget or dependency rule was relaxed.

## Reproduce

From the repository root after installing the pinned dependencies:

```powershell
pnpm nx run-many -t lint,test,build -p hcm-web,hcm-api,hcm-web-e2e,hcm-runtime-contract,hcm-api-runtime-domain,hcm-api-runtime-application,hcm-api-runtime-infrastructure,hcm-api-runtime-transport,hcm-api-runtime-module,hcm-web-runtime-context,hcm-web-navigation-catalog,hcm-web-runtime-feature-placeholder,hcm-web-shell,platform-web-runtime-shell --parallel=3
pnpm exec playwright test --config apps/hcm/web-e2e/playwright.config.mts --project=chromium --workers=2
pnpm docs:check
pnpm architecture:check
pnpm ux:check-pages
pnpm lint:tooling
git diff --check
```

The browser suite starts the HCM dev server unless `BASE_URL` selects an existing server. Production-shell HTTP fixtures exist only in tests. Screenshots are written under the ignored `.tmp/hcm-production-shell/` directory.

## Limits and activation prerequisites

Docker Desktop's engine was unavailable, so the static-container entrypoint extension and two-configuration image smoke check were **not executed**. After starting Docker, follow the existing [container validation procedure](../../platform/engineering/container-validation.md); HCM smoke configuration now uses `/api`. Firefox/WebKit, real IdP flows and cloud ingress were not verified.

Workspace-wide `nx format:check --uncommitted` reports the pre-existing input `CODEX-IMPLEMENTATION-PROMPT.md`. That instruction document was not reformatted as part of implementation. Maintained implementation files were formatted using repository Prettier settings. Existing Foundation Lab lint warnings remain warnings; no rule was suppressed.

Production tenant persistence, verified session adapters, cookies/CSRF and trusted ingress still require their implementation and deployment work. The unconfigured adapters fail closed. See the [maintainer guide](../architecture/shell/README.md#production-integration-prerequisites). No cloud resources, tenant databases or public authentication trust configuration were changed.
