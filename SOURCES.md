# Current implementation references checked while preparing this milestone

- Angular `provideAppInitializer()` is the stable replacement for deprecated `APP_INITIALIZER` and can wait for a Promise/Observable during startup. This milestone uses it only for local runtime configuration, not remote session bootstrap.
- UI5 Web Components configuration supports runtime `setTheme()` and requires additional library `Assets.js` imports when switching away from the built-in default Horizon theme.

These references are implementation guidance. Repository-pinned versions remain authoritative when coding.
