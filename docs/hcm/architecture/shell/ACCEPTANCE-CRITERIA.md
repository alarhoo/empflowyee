# Acceptance Criteria — Production HCM Shell

- [x] HCM web runtime config loads from `/assets/config.json` before dependent providers initialize.
- [x] Remote tenant/session bootstrap uses an explicit runtime state machine.
- [x] Tenant discovery is performed by HCM API using trusted host context.
- [x] Unknown tenant gets a dedicated state.
- [x] Suspended/deactivated tenant cannot enter HCM feature routes.
- [x] Missing authenticated session enters auth-required state.
- [x] Authenticated session produces a typed runtime context.
- [x] User > tenant > platform theme precedence works.
- [x] Tenant branding overlay works without theme leakage.
- [x] User > tenant > platform locale preference precedence works.
- [x] Canonical catalog models Space/Page/Group/Feature.
- [x] Catalog filtering combines entitlements, permissions and feature flags.
- [x] Route guard uses canonical catalog metadata.
- [x] Catalog library does not import feature implementations.
- [x] At least one lazy placeholder route proves feature routing/access mechanics.
- [x] Direct unauthorized URL does not load the protected feature.
- [x] Backend authorization remains independent of frontend visibility.
- [x] Browser request payload cannot override authoritative tenant context.
- [x] No auth token is stored in localStorage.
- [x] lint/test/build succeed for affected projects.

Verified locally; see the [validation record](../../testing/HCM-SHELL-VALIDATION.md) for evidence and production-adapter/deployment prerequisites. Authenticated contexts are proven through test-only adapter overrides; a real production IdP is outside this milestone.
