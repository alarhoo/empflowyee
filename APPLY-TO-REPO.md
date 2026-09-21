# Apply this overlay to the empFLOWyee repository

The foundation has been applied to this checkout. Keep this guide as the application sequence for future changes; see `docs/platform/engineering/container-validation.md` for verification results and the implemented file locations.

## 1. Copy the overlay

Copy these directories into the repository root:

- `docs/`
- `.ai/`
- `containers/`
- `tools/containers/`

Do not blindly overwrite an existing file with the same name; review the diff.

## 2. Add Nx Docker support using Nx itself

Use Nx to install the Docker plugin version compatible with the workspace:

```bash
pnpm nx add @nx/docker
```

Do not manually choose an `@nx/docker` version.

## 3. Inspect current project build outputs before adding Dockerfiles

Run:

```bash
node tools/containers/inspect-projects.mjs
```

The script writes:

```text
.tmp/container-project-inventory.json
```

Review the detected project roots, build targets and output paths. This inventory is intentionally generated from the real repository rather than guessed in this bundle.

## 4. Configure the three NestJS applications for Nx prune

Use the current Nx 23.2+ pruning model for Node containers. Verify each API has these targets:

- `build`
- `prune-lockfile`
- `copy-workspace-modules`
- `prune`

If the generated Nest applications do not already have them, add them according to `docs/platform/engineering/nest-container-standard.md`.

Do not re-enable legacy `generatePackageJson` merely to make Docker work.

## 5. Materialize per-project Dockerfiles

After the inventory is reviewed:

- Angular web projects: adapt `containers/angular/Dockerfile.template`
- NestJS APIs: adapt `containers/nest/Dockerfile.template`
- Marketing: adapt `containers/next/Dockerfile.template`

Keep Dockerfiles at each Nx project root so `@nx/docker` can infer `docker:build` and `docker:run` targets.

## 6. Add runtime configuration code

Angular applications must load `/assets/config.json` before app bootstrap. Implement the typed loader in a platform web library rather than duplicating it in three apps.

NestJS applications must validate runtime configuration during bootstrap.

Next.js must read environment-varying values on the server at runtime.

## 7. Verify locally

Run:

```bash
node tools/containers/verify-foundation.mjs
```

Then build one representative image of each class before applying the pattern to all seven deployables:

```text
hcm-web       Angular/static
hcm-api       NestJS/Node
marketing-web Next.js/Node
```

## 8. Only after local proof

Apply the proven template to:

```text
account-web
console-web
account-api
console-api
```

This avoids seven simultaneous failures from one incorrect container assumption.
