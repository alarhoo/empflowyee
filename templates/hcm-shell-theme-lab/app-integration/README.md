# HCM app integration snippets

These are references, not blind patches. Codex must inspect the actual generated `hcm-web` files before applying them.

Important:

- `ui5-init.ts` must load before Angular bootstrap.
- global theme SCSS must be loaded by the HCM application's global stylesheet/build config.
- the app route should compose the shell and lazy-load Theme Lab.
- do not copy feature implementation into the app project.
