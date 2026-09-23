# Angular runtime configuration standard

Applies to `account-web`, `hcm-web`, and `console-web`.

## Why

Angular browser bundles are compiled artifacts. Environment-specific build-time substitution would require a new image per environment and violate build-once/promote-many.

## Contract

The container generates:

```text
/assets/config.json
```

before NGINX starts.

Minimum common fields:

```json
{
	"environment": "dev",
	"releaseId": "git-sha-or-release-id",
	"apiBaseUrl": "https://..."
}
```

Each app may extend this through its own typed runtime-config interface, but it must preserve a small common platform base contract.

## Security rule

Everything in `/assets/config.json` is readable by every browser user.

Therefore it may contain:

- public API URL
- public application URL
- environment name
- release ID
- public OAuth client ID where the identity provider treats it as public

It must never contain:

- OAuth client secret
- database credentials
- signing/encryption keys
- service account credentials
- private API keys

## Bootstrap behavior

1. Fetch `/assets/config.json` before route-driven application work starts.
2. Validate the response against the app's runtime-config contract.
3. Fail into an explicit configuration-error screen if invalid.
4. Expose the validated configuration through one platform abstraction.
5. Do not let individual feature libraries read `window.__env`, `process.env`, or fetch config independently.

## Caching

`/assets/config.json` must be returned with `Cache-Control: no-store`.

Hashed Angular JS/CSS assets should use long-lived immutable caching.

## Repository implementation

`platform-runtime-contract` owns validation and the public base interface. `platform-web-runtime-shell` supplies both the existing pre-bootstrap loader and `provideRuntimeConfig()`, which uses `provideAppInitializer()` for local configuration. HCM uses the initializer; Account and Console retain their existing bootstrap helper. Both expose `RUNTIME_CONFIG` and show safe configuration failures. Remote HCM tenant/session requests run after Angular initialization.

The base Account/Console parser requires absolute HTTP(S) API URLs without credentials/query/fragment and HTTPS outside `local`. Under the [HCM same-origin ADR](../../hcm/adr/ADR-HCM-SAME-ORIGIN-RUNTIME.md), the HCM parser instead requires the exact `/api` path while preserving the shared environment/release metadata. The shared container entrypoint supports this exact relative path as well as the existing absolute URL formats. Protocol-relative URLs and arbitrary relative paths remain rejected.

Each app's `public/assets/config.json` supports local development. Container staging excludes that local file; startup writes a new file from `APP_ENVIRONMENT`, `RELEASE_ID` and `API_BASE_URL`. Missing or malformed values stop the container before NGINX starts. NGINX serves configuration with `no-store`, HTML with `no-cache`, and only fingerprinted assets with immutable caching.

The shared loader accepts an optional product parser. HCM supplies `parseHcmBrowserRuntimeConfig` from its runtime context library and adds optional boolean `hcmThemeLabEnabled`. The Angular container entrypoint emits that field only when `HCM_THEME_LAB_ENABLED=true|false` is supplied. Invalid values stop startup. When omitted, HCM enables the developer lab outside PROD and disables it in PROD. See the [lab runtime gate](../../hcm/ux/theme-lab/README.md#runtime-gate); it is not an authorization mechanism.
