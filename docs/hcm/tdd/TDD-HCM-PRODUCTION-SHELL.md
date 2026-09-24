# TDD — HCM Production Shell

## Architecture summary

```text
Browser
  |
  | https://acme.empflowyee.com
  v
Managed ingress / load balancer
  |-- /*      -> hcm-web
  `-- /api/*  -> hcm-api

hcm-web
  |-- local runtime config
  |-- tenant discovery
  |-- authenticated session context
  |-- theme + locale projection
  |-- catalog projection
  |-- shell
  `-- lazy feature routes

hcm-api
  |-- authoritative tenant resolution
  |-- auth/session boundary
  |-- runtime module
  `-- downstream domain authorization
```

## Angular initialization

Use Angular `provideAppInitializer()` only for local runtime configuration such as `/assets/config.json`.

Remote tenant/session requests are handled after Angular starts through the shell runtime state machine. This avoids turning a transient network/auth failure into an application-bootstrap failure.

## Runtime state

Use a discriminated union/signal state rather than independent booleans.

Conceptual model:

```ts
type HcmRuntimeState =
	| { kind: 'tenant-loading' }
	| { kind: 'tenant-not-found' }
	| { kind: 'tenant-suspended'; tenant: TenantPresentation }
	| { kind: 'auth-required'; tenant: TenantPresentation }
	| { kind: 'session-loading'; tenant: TenantPresentation }
	| { kind: 'ready'; context: HcmRuntimeContext }
	| { kind: 'error'; error: RuntimeFailure }
```

## Runtime API

### `GET /api/v1/runtime/tenant`

Public but host-scoped and intentionally minimal.

The HCM API derives tenant identity from trusted request host/ingress context.

Response contains only safe information required to render pre-auth shell/login branding and choose authentication strategy.

### `GET /api/v1/runtime/session`

Authenticated.

Returns runtime context used by the HCM shell.

Do not make this endpoint the authorization authority for later business calls. Each business API independently authorizes its operation.

## Same-origin session model

Preferred authentication architecture is a backend-for-frontend style HCM session:

- browser does not persist external provider access tokens in localStorage
- HCM API participates in OIDC/SAML/provider callback flows
- browser holds a secure HttpOnly session cookie
- `/api/*` remains same-origin under the tenant hostname

This is an architectural target; IdP adapter implementation can be a later milestone.

## Tenant context propagation

HCM API should establish a typed request-scoped tenant context once, before application use cases execute.

Downstream business modules consume that context rather than trusting `tenant_id` from request payloads.

This context must be designed to later feed PostgreSQL RLS/session tenant context.

## Access policy

Do not collapse roles, permissions and entitlements.

```text
role         = business grouping/presentation context
permission   = user capability
entitlement  = tenant licensed capability
feature flag = runtime product rollout control
```

Frontend navigation/access policy evaluates all relevant dimensions.

Backend domain/API authorization evaluates permissions and tenant context independently.

## Application catalog

The canonical catalog is compile-time product metadata.

It does not import lazy feature implementations.

A route is connected to catalog metadata using a stable catalog id.

Example conceptual entry:

```ts
{
  id: 'employee.my-profile',
  route: '/employee/my-profile',
  spaceId: 'employee',
  pageId: 'my-overview',
  groupId: 'information-service',
  entitlement: 'employee-core',
  permissions: ['employee.profile.read.self']
}
```

The visible navigation tree is a computed projection of catalog + runtime access context.

## Route composition

Lazy imports live in the HCM app composition root or a dedicated composition library explicitly allowed by the repository architecture.

The pure catalog library must remain independent of features.

A route guard reads `catalogId` and evaluates the same catalog policy used for navigation.

## Theme

The shell does not implement theming itself.

It consumes the approved HCM theme service from the UX foundation.

Resolution:

```text
base theme = user preference ?? tenant default ?? platform default
brand      = tenant primary color / approved tenant brand tokens
```

Pre-auth tenant discovery supplies tenant defaults so login/status pages can be branded.

Authenticated session may refine with user preference.

## Locale

Resolution:

```text
user preferences
  -> tenant defaults
    -> platform fallback
```

Keep presentation settings separate from legal/employment/payroll business context.

## Shell layout

Use approved native UI5/Fundamental primitives from the HCM UX foundation.

Expected shell responsibilities:

- brand/tenant identity area
- Space navigation
- user/profile area
- global shell actions that are truly cross-feature
- route content outlet
- runtime/status states

No business forms/tables belong in the shell.

## Dependency boundaries

Expected conceptual Nx dependencies:

```text
apps/hcm/web
  -> hcm web shell
  -> hcm navigation catalog
  -> lazy feature libraries (composition only)

hcm web shell
  -> runtime data-access/context
  -> navigation catalog
  -> UX/theme primitives
  -> access policy utilities

navigation catalog
  -> runtime-neutral contracts/util only
  X  feature implementation

runtime web data-access
  -> runtime contract

hcm api runtime transport
  -> runtime application
  -> runtime contract

runtime application
  -> runtime domain

runtime infrastructure
  -> application ports/domain
```

## Local development

Prefer a local tenant-like host and Angular proxy:

```text
http://acme.empflowyee.com:4302/api/* -> local hcm-api
```

This keeps browser semantics close to production and reduces auth/CORS differences.

## Testing

See `docs/hcm/testing/HCM-SHELL-TEST-STRATEGY.md`.

## Implemented library reconciliation

The existing `hcm-web-runtime-context`, `hcm-web-navigation-catalog`, `hcm-web-shell` and `hcm-web-ux-theme` libraries are reused. Runtime data access also owns the access facade and `canMatch` guard, avoiding a second policy library; the pure policy evaluator belongs to the existing catalog utility. Existing `type:data-access -> type:util/type:contract` rules permit these dependencies without changes to lint boundaries.

New libraries are `hcm-runtime-contract`, the five `hcm-api-runtime-{domain,application,infrastructure,transport,module}` roles and `hcm-web-runtime-feature-placeholder`. Their source paths follow the existing runtime/product taxonomy. The contract is `runtime:universal`. Domain/application code has no Nest, HTTP or persistence dependencies.

The actual state union carries `discovery` in tenant-status/auth/session-loading states, `context` in ready, and a sanitized `failure` in error. The store validates and recursively freezes successful responses, coalesces bootstrap/retry requests, and never exposes fixture mutation methods. Correlation IDs are sent per request; request headers and server errors never enter browser diagnostics.

### Native page selection and installed API evidence

All shell status/catalog/access-denied pages and the placeholder use **UX-FP-STANDARD-PAGE**, **NATIVE** mode. The installed Fundamental NGX 0.64.x wrappers expose `Page` from `@fundamental-ngx/ui5-webcomponents-fiori/page` with `header`/`footer` slots, and `Bar`, `Title`, `Button`, `Avatar`, `BusyIndicator`, and `MessageStrip` from their `@fundamental-ngx/ui5-webcomponents/*` entry points. `ShellBar` comes from `@fundamental-ngx/ui5-webcomponents-fiori/shell-bar` and uses native logo/profile slots. The logo slot keeps branding visible on phones, where native primary/secondary titles intentionally collapse. Profile avatars use the native Placeholder color scheme, which passes the four-theme contrast check.

No control or reusable floorplan is recreated. The app applies `hcm-app-canvas` once. Its `@defer (on immediate)` boundary loads the production shell immediately after a loading announcement and keeps the unchanged initial bundle budget intact. App routes exclusively own the placeholder lazy import; catalog metadata has no implementation imports. No table, form or My Profile feature is introduced.

### Current adapter and deployment status

The source implements the tenant/session boundary, not real authentication. Unconfigured tenant persistence returns 503 and unconfigured sessions return 401. Local discovery is explicit and loopback-only; there is no production or local fake session adapter. API tests inject verified-session fixtures inside the Nest testing module. Browser tests intercept endpoints outside production code.

Tenant context uses exact preserved Host registration and ignores forwarded headers. Managed ingress, production tenant-directory persistence, verified IdP/session adapters and cookie/CSRF implementation are prerequisites for activation. No Cloud Run IAM/ingress or database policy is changed. HCM container configuration must use `API_BASE_URL=/api`; existing direct-service environment values need reviewed IaC updates before deployment.

Language and native density are applied through supported APIs. Every other presentation preference is resolved and exposed for future feature formatters. The shell does not change Angular's immutable bootstrap locale token or use private UI5 timezone APIs. See [localization](../architecture/shell/localization.md) and the [validation record](../testing/HCM-SHELL-VALIDATION.md).

## Native shell interaction revision

Use the installed Fundamental wrappers for UI5 ShellBar (branding/context content,
start button), UserMenu, UserMenuAccount, UserSettingsDialog/Item/View/AccountView,
NotificationList/NotificationListItem and ProductSwitch/Item. The existing UI5
ShellBar content slot with its native separator fulfills the context-area responsibility; do not mix
Fundamental Core shellbar internals into the web-component shellbar.

`HcmApplicationNavigation` owns retained Space/Page signals and guarded return/sign-out
intents. `HcmLaunchpadState` references these signals instead of resetting selection.
`HcmRuntimeStore` resolves validated local language/date/time overrides after server
preferences; storage contains presentation choices only, never access/session tokens.
Development sign-out clears context and uses a tab-local signed-out flag. Explicit
re-entry repeats the normal tenant/session discovery. Production logout remains deferred.

The shell embeds the existing notification feature in an embedded mode, preserving
its cursor, revision and idempotent read behavior. Settings embeds the existing
notification-preference editor and honors its pending-save/dirty guard before closing
or replacing persona. No new notification commands or recipient policies are introduced.
`productLinks` is optional public deployment configuration (up to four HTTP(S) links,
no URL credentials); destinations authenticate independently. Local Account/Console
links require those development servers to be running.

Business filters use native Form label spans of 12 at each breakpoint. Object detail
properties use native Forms. The shared Object Page uses native FCL layout values for
maximize/restore and resolves the existing non-mutating back/close action separately
from mutating close commands. Native table row-click and row navigation actions share
the feature's existing selection method. No business CSS or theme forks are added.

Storybook remains on hold. Validate navigation, profile/settings persistence, dirty
close protection, notifications, row keyboard activation and FCL controls directly
in the app, with focused unit tests and normal architecture/lint/build gates.
