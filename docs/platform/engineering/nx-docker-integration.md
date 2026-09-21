# Nx Docker integration

## Decision

Use the official `@nx/docker` plugin rather than inventing a parallel Docker task runner.

Install using:

```bash
pnpm nx add @nx/docker
```

Nx can infer Docker targets from a `Dockerfile` located in an Nx project and exposes targets such as:

```text
docker:build
docker:run
```

## Why this matters

Docker becomes part of the Nx project graph/task graph. This enables:

- affected-aware image builds
- task dependency ordering
- caching where applicable
- project-scoped container commands
- one architecture graph rather than separate CI shell-script knowledge

## Node APIs

Use Nx's prune workflow for production dependencies. The prune targets are part of the Nx graph and can be cached.

## CI

Release CI asks Nx which deployable projects are affected and builds images only for those deployables.

Do not use `docker build .` indiscriminately for all seven services after every merge.
