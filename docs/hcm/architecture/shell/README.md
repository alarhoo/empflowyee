# Production HCM shell

The [production-shell TDD](../../tdd/TDD-HCM-PRODUCTION-SHELL.md) supersedes the earlier fixture shell. Its [HCM-0 addendum](../../tdd/TDD-HCM-0-LAUNCHPAD.md) defines the implemented catalogue launchpad and isolated local sessions. The application uses the existing theme engine and maintained native controls. No business feature or production sign-in adapter is included.

## Ownership

| Project                               | Responsibility                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `hcm-runtime-contract`                | Universal discovery/session DTOs, response validation and preference precedence                 |
| `hcm-web-runtime-context`             | Read-only signal context, HTTP bootstrap, explicit states, access facade and route guard        |
| `hcm-web-navigation-catalog`          | Pure feature metadata, placements and capability filtering; never imports implementations       |
| `hcm-web-shell`                       | Native chrome, status pages, Space/Page/Group navigation and theme/language/density composition |
| `hcm-web-runtime-feature-placeholder` | Lazy native Page used to prove routing; no employee implementation                              |
| `hcm-api-runtime-domain`              | Tenant/session ports, internal authority and exact Host normalization                           |
| `hcm-api-runtime-application`         | Discovery allowlist, lifecycle, verified membership and expiry policies                         |
| `hcm-api-runtime-infrastructure`      | Fail-closed adapters and isolated local tenant/persona infrastructure                           |
| `hcm-api-runtime-transport`           | HTTP endpoints, request-scoped tenant context and sanitized correlation errors                  |
| `hcm-api-runtime-module`              | Nest composition and exported request context for downstream HCM modules                        |

`apps/hcm/web` owns lazy feature imports. Its immediately deferred shell keeps native controls out of the initial application chunk without delaying local configuration initialization. A transient loading announcement is rendered while that chunk loads. Remote bootstrap starts after Angular initialization and is shared by shell and route guards.

The canonical inventory supplies all 170 planned business applications across five
Spaces and 20 Pages. Persona mode applies role placement plus explicit discovery
permissions and tenant entitlements. Planned tiles remain visible and open one
shared dialog. Search matches app title, code, domain and placement labels. The
anchored profile dropdown exposes identity, email and server-advertised local
controls. A separate native appearance menu selects Horizon Light/Dark, HER Light/Dark
or Follow device, and persists that choice locally. The lazy navigation feature owns
the launchpad; the global shell owns chrome and frames routed content.
No valid MY_PROFILE implementation exists in this checkout, so it remains Planned.

`runtime-workspace` at `/workspace` is a separate routing proof, outside the
business launchpad. It requires `employee-core`, `employee.directory.read` and
`shell-preview`; local personas receive no such business permissions. A denied
direct route redirects to `/access-denied` before the lazy loader runs. Navigation
visibility is never backend authorization.

## Local operation

Follow the root [developer setup](../../../../README.md#start-here). Run
`pnpm dev:hcm --host=127.0.0.1` and `pnpm dev:hcm-api`, then open
`http://acme.localhost:4302`. The proxy forwards `/api/**` to `127.0.0.1:4402`
and preserves Host. The API launcher explicitly enables isolated local tenants
and sessions; it rejects production/cloud/nonlocal configuration. Direct API
startup without these flags retains the unconfigured adapters.

The default Dunder Mifflin session is Jim Halpert (Employee). The native profile
menu selects Michael Scott (Manager), Toby Flenderson (HR Operations) or David
Wallace (Tenant Administrator). Reload restores Jim. **Inspect all applications**
exposes all five Spaces without changing any route or backend permissions. Persona
selection resets inspection and search, refreshes the normal runtime DTO and
returns home. Tenant licensing stays constant across personas.

`HCM_LOCAL_TENANTS=true` and `HCM_LOCAL_SESSION=true` require
`APP_ENVIRONMENT=local`, a non-production Node process, no Cloud Run `K_SERVICE`,
and loopback request peers. Unknown personas are denied; session membership is
restricted to Dunder Mifflin. The additional lifecycle hosts `trial.localhost`,
`grace.localhost`, `suspended.localhost` and `deactivated.localhost` remain discovery
fixtures and do not acquire that membership. Other hosts return 404.

Set `HCM_LOCAL_SESSION=false` when starting the local launcher to exercise the
normal authentication-required state. The session selection header is confined
to the runtime facade; there are no feature-level development authorization
branches, browser principal fixtures, stored tokens or mutable authentication
endpoints. See the [accepted local-session ADR](../../adr/ADR-HCM-LOCAL-DEVELOPMENT-SESSION.md).

## Production integration prerequisites

Managed ingress must route `/api/*` to HCM API and preserve the tenant Host. Forwarded and X-Forwarded-Host headers are deliberately ignored until there is an explicitly reviewed trusted-proxy policy. An exact server-side hostname registration must resolve to an internal tenant identity. The request-scoped `HcmRequestTenantContext` resolves once and is the future input to RLS; no database/RLS implementation is introduced here.

Replace the unconfigured `TenantDirectory` with a real provisioning/persistence adapter and `HcmSessionReader` with verified server session resolution. The reader must check authenticity, revocation and membership; the application also checks expiry and tenant identity. Session cookies must be Secure, HttpOnly and use an appropriate SameSite policy. State-changing cookie APIs need explicit CSRF protection before introduction. No state-changing runtime endpoint exists in this milestone. The discovery adapter supplies an optional `/api/v1/auth/...` login path only when that boundary exists.

HCM `/assets/config.json` requires `apiBaseUrl: "/api"`. Container deployment must set `API_BASE_URL=/api` with the existing environment/release coordinates. Existing direct Cloud Run web/API topology is not activated by this source change; do not promote until ingress and real adapters are configured. No IAM or infrastructure policy was relaxed.

## Presentation and verification

`UX-FP-STANDARD-PAGE`, NATIVE mode, uses maintained UI5 Page/Bar/Title for status, catalog and placeholder content, plus ShellBar, Avatar, Button, BusyIndicator and MessageStrip. The application applies the shared 90rem canvas once. The shell composes the existing `HcmThemeService`, public UI5 language API and Fundamental density service. See [locale resolution](localization.md).

Use the [test strategy](../../testing/HCM-SHELL-TEST-STRATEGY.md) and [validation record](../../testing/HCM-SHELL-VALIDATION.md). The independent [Foundation Lab](../../ux/theme-lab/README.md) and curated [Storybook](../../ux/storybook.md) remain available; this milestone introduces no reusable floorplan implementation or new canonical Storybook entry. Earlier [fixture-shell validation](validation.md) remains historical evidence only.
