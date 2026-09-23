# Runtime Context

The HCM shell should expose one immutable/effectively read-only runtime context once ready.

Conceptual sections:

```text
RuntimeContext
├── tenant
├── user
├── access
│   ├── roles
│   ├── permissions
│   ├── entitlements
│   └── featureFlags
├── preferences
├── branding
└── session metadata
```

Features should consume narrow selectors/facades rather than mutate the context.

Changes such as preference updates should go through explicit services/use cases and refresh/reconcile context deliberately.

The implementation replaces the earlier fixture mutations with `ensureLoaded()` and `refresh()`. `context()` returns null until ready; `tenant()` and `preferences()` expose safe pre-auth presentation while loading the authenticated session. Responses are validated and recursively frozen. Tenant defaults and the independent branding overlay are carried inside `tenant`; the resolved preference selector applies user → tenant → platform per property, with `allowUserTheme` respected. There is no browser-persisted credential or editable access context.

The presentation-only appearance service resolves a saved full variant or device mode
without mutating runtime context. Global application navigation intents live in
the runtime facade; Space/Page selection and rendering belong to the lazy launchpad.
See [theme and locale resolution](THEME-LOCALE-RESOLUTION.md). The optional `user.email`
comes from the session provider and is shown in the anchored profile dropdown.
