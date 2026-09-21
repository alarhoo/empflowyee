# Next.js runtime configuration standard

Applies to `marketing-web`.

## Build-once rule

Values that vary between DEV, QA and PROD must be resolved at server runtime.

Do not use environment-specific `NEXT_PUBLIC_*` values as the default mechanism because public values can be inlined into browser bundles during `next build`.

## Preferred patterns

Use one of these, in order:

1. Server Components reading `process.env` at request/runtime where appropriate.
2. Route Handlers exposing a deliberately public runtime-config response to client components.
3. A server-rendered bootstrap payload containing only approved public values.

## Secrets

Secrets stay server-side and must never be serialized into page props, client components, route responses, static JS, or logs.

## Container

Use Next.js standalone output where the real generated project configuration supports it. The Docker implementation must be verified against the Nx/Next output produced by `marketing-web`; do not assume an output path from a generic non-Nx Next.js tutorial.

## Repository implementation

`next.config.js` enables standalone output with the monorepo as the tracing root. The verified server path is `.next/standalone/apps/marketing/web/server.js`; static files and `public/` are copied beside that nested app. The container binds to `0.0.0.0` and defaults to port 8080.

The container entrypoint validates `APP_ENVIRONMENT`, `RELEASE_ID` and `PORT` with the compiled shared contract before importing the standalone server in the same process. This is necessary because a Next instrumentation failure alone can leave a listening process alive. Instrumentation also validates development-server configuration, excluding the build phase. `/api/runtime-config` dynamically returns only environment and release metadata with `Cache-Control: no-store`. `/health/live` is dependency-free, and `/health/ready` validates the runtime configuration. Environment-specific endpoints can be added only with an explicit public contract; no `NEXT_PUBLIC_*` substitution is used.

Nx artifact caching is disabled for Marketing's build because copying the standalone symlinks fails on Windows without symlink privileges. Next's own build cache and Docker dependency layers remain available. This avoids requiring changes to machine security settings.
