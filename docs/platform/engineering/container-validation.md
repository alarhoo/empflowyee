# Container foundation verification

## Implemented foundation

Each of the seven deployables has a Dockerfile at its Nx project root. Builds use the monorepo context, pinned Node 24.21.0, frozen pnpm dependencies, non-root runtime users, health checks and OCI source/revision/release/creation labels. Docker owns its image cache; the self-contained Docker target does not also run a duplicate host build.

Angular images stage only browser output and generate public configuration at startup. Nest images use dedicated Nx prune targets and production-only dependencies. Marketing preserves Next's verified standalone layout and validates configuration before its server starts. The runtime standards describe the contracts and implementation details.

The original project inventory was reviewed before Dockerfiles were materialized. `tools/containers/inspect-projects.mjs` refreshes `.tmp/container-project-inventory.json`; this machine-specific generated file is ignored by Git and excluded from Docker contexts.

## Local commands

Install dependencies with `pnpm install --frozen-lockfile`. Docker Desktop must be running with Linux containers. After installing Docker Desktop on Windows, open a new terminal to pick up its CLI on PATH.

```bash
pnpm exec node tools/containers/verify-foundation.mjs
pnpm exec node tools/containers/inspect-projects.mjs
pnpm nx run-many -t lint test build
pnpm nx run-many -t docker:build -p hcm-web,hcm-api,marketing-web --parallel=2
pnpm exec node tools/containers/smoke.mjs hcm-web hcm-api marketing-web
```

After the representative images pass, build and smoke-test Account and Console the same way. The Nx plugin's local image names follow project paths, for example `apps-hcm-web` and `apps-account-api`. Local tags are development conveniences; release publishing uses immutable commit tags and promotion uses digests.

Required deployed values:

| Runtime     | Required values                                 | Listener             |
| ----------- | ----------------------------------------------- | -------------------- |
| Angular     | `APP_ENVIRONMENT`, `RELEASE_ID`, `API_BASE_URL` | 8080                 |
| Nest / Next | `APP_ENVIRONMENT`, `RELEASE_ID`                 | `PORT`, default 8080 |

Use `dev`, `qa` or `prod` as the deployed environment. Local development supports `local`. Infrastructure owns actual endpoints and secret references; the smoke tests use public example URLs and do not contact them. Keep the image's release identity unchanged when promoting it.

## Verified on 2026-09-21

- Windows with Docker Desktop 4.91.0, Linux containers, Node 24.21.0, pnpm 12.5.1 and Nx 23.2.1.
- `pnpm nx run-many -t lint test build`: 29 tasks passed across 17 projects.
- All seven images built through official Nx Docker targets. HCM web, HCM API and Marketing were tested before extending their container patterns to Account and Console.
- Each image was started twice with DEV/QA runtime configuration while preserving its image ID. Tests covered non-root execution, live/ready endpoints, API routes or web content, clean shutdown and missing-configuration rejection.
- Angular checks covered public JSON, `no-store`, SPA fallback and immutable fingerprinted assets. Next checks covered dynamic public metadata and standalone startup preflight. Node checks used a non-default `PORT`.
- Architecture, documentation, container-foundation, workflow syntax/ShellCheck, runtime-contract and release-helper checks passed.
- An HCM web source change selected only `hcm-web` and `hcm-web-e2e` through Nx affected analysis.
- A tagged validation build preserved all repeated Nx `--build-arg` values in the OCI revision, release and creation labels.

The existing generated Angular welcome components still emit stylesheet budget warnings, and Angular's explicit ESLint executor emits an Nx deprecation warning. They do not fail the checks. Marketing build artifact caching is disabled because Windows rejects Nx's standalone symlink copies without additional privileges; Docker dependency caching remains enabled.

Cloud Run provisioning and real environment/Secret Manager bindings remain the separate next phase. No database, identity-provider or migration behavior is invented by this foundation.
