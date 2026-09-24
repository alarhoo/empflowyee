# FDD — HCM Production Shell

## Purpose

Provide the production runtime shell used by every tenant HCM feature.

The shell establishes tenant, session, branding, locale, entitlement, permission and navigation context before business features become usable.

## Actors

- unauthenticated tenant user
- employee
- manager
- HR operator
- tenant administrator
- tenant super administrator

Roles are not the authorization primitive. Effective permissions and entitlements determine access.

## Functional requirements

### Tenant discovery

Given a tenant hostname such as `acme.empflowyee.com`, the system must determine whether the tenant exists and whether HCM access is currently allowed.

The browser may display the hostname-derived tenant hint, but authoritative tenant resolution occurs in HCM API.

### Tenant lifecycle

The shell must represent trial, active, grace, suspended and deactivated tenant states.

Trial/active tenants may enter HCM subject to authentication/access.
Grace tenants may enter HCM with a warning.
Suspended/deactivated tenants must not enter business features.

### Authentication hand-off

For a valid tenant without an authenticated session, the shell must enter an authentication-required state and initiate the tenant-configured authentication journey through the HCM authentication boundary.

### Session context

After authentication the shell must know enough presentation/access context to build the user experience:

- tenant
- current user/employee presentation identity
- roles
- explicit permissions
- licensed entitlements
- feature flags
- user preferences
- tenant branding/defaults

### Theme and branding

The shell must support:

- Horizon Light
- Horizon Dark
- HER Light
- HER Dark
- tenant primary color overlay

The tenant policy can lock the theme. Otherwise an explicit local light/dark choice
overrides the server user preference; absent either, follow the device color scheme
live within the tenant-selected theme family. The shell toggle persists only the
appearance mode locally.
Tenant branding remains independent of the base theme.

### Locale

Display preference precedence is user -> tenant -> platform.

Supported preference categories include language, locale, timezone, date/time/number formatting and density where supported.

### Navigation

HCM navigation is defined by:

Space -> Page -> Group -> Feature

Only features licensed to the tenant and permitted to the current user should be presented.

The same feature may appear in multiple navigation placements without duplicating implementation.

### Direct navigation

Typing/pasting a feature URL must run the same presentation access checks as navigation selection.
Unauthorized routes must not load the feature.

### Lazy loading

Business features are lazy-loaded Nx feature libraries inside the one HCM Angular application.

### Error/status handling

The shell must have distinct experiences for:

- unknown tenant
- suspended/deactivated tenant
- authentication required
- access denied
- runtime/bootstrap failure

## Non-functional requirements

- no application secrets in browser runtime config
- no authorization based solely on frontend state
- no tenant authorization based on browser-provided tenant id
- no persistent auth tokens in localStorage
- predictable bootstrap state machine
- accessibility consistent with approved HCM UX foundation
- all features remain independently lazy loadable
- shell must not contain business-domain implementation

## Acceptance criteria

See `docs/hcm/architecture/shell/ACCEPTANCE-CRITERIA.md`.

## HCM-0 local launchpad addendum

The default isolated local-development experience establishes the Dunder Mifflin
session through the real runtime API. The profile menu offers Jim Halpert,
Michael Scott, Toby Flenderson and David Wallace, along with an explicit full
catalogue inspection mode. Normal persona navigation follows canonical roles,
discovery permissions and entitlements. Inspection changes visibility only.

Render all canonical apps in their Space/Page/Group placements. Planned apps
remain discoverable with a Planned label and use one shared unavailable dialog.
Search covers title, code, domain and placement metadata across the visible
catalogue. Available apps must use their approved lazy routes and normal access
checks. All current apps, including MY_PROFILE, remain Planned because this
checkout has no valid domain implementation. No business placeholder is created.

The authentication-required fallback remains for environments without a verified
session. Local activation and safeguards follow the
[local-session ADR](../adr/ADR-HCM-LOCAL-DEVELOPMENT-SESSION.md); component ownership
and native APIs follow the [launchpad TDD](../tdd/TDD-HCM-0-LAUNCHPAD.md).

### Launchpad presentation and profile controls

The launchpad uses landscape backgrounds, separated responsive tiles with maintained
icons, canonical page descriptions and clear group counts. All theme adaptation is
owned by the shared UX foundation and retains native controls and accessibility.

The avatar opens the native UI5 User Menu with the server-provided photo (initials
fallback), name, email and tenant. Settings opens the native User Settings Dialog
with User Information, Appearance, Language & Region and Notifications. Development
persona and catalogue-inspection controls belong to User Information. Appearance
includes all four Horizon/HER variants and Follow device, honoring tenant policy.
Language/date/time presentation choices persist per account and tenant in this browser;
notification choices use the existing database-backed self-preference service.

The native shellbar displays branding and the current canonical app title, search,
notifications, avatar and Product Switch. The notification tray and My Notifications
share one domain-owned inbox implementation. Only existing read transitions are
exposed; the reference image does not authorize deletion or bulk clearing. Product
links come from public runtime configuration and grant no cross-product access.

Every business route exposes Back to launchpad and preserves the selected Space/Page
across lazy-screen recreation, including browser Back. Local-development Sign Out
clears the workspace context and suspends automatic entry for this tab until explicit
re-entry. This is not production identity-provider logout or token revocation.

The shell and landscape span the viewport; only content uses the shared centered
width. The launchpad remains a lazy navigation feature independent of shell chrome.
