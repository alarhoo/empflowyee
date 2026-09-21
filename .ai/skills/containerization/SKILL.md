# Skill: containerization

## Use when

Adding or changing a Docker image for an empFLOWyee deployable.

## Required reading

- `docs/platform/adr/ADR-container-runtime-strategy.md`
- `docs/platform/architecture/container-runtime-architecture.md`
- `docs/platform/engineering/nx-docker-integration.md`
- runtime-specific standard for the project

## Procedure

1. Identify the exact Nx project and its tags.
2. Inspect the real Nx build output; never guess output paths.
3. Preserve build-once/promote-many.
4. Keep application secrets out of build args and image layers.
5. Integrate Docker through Nx.
6. Use multi-stage builds.
7. Minimize runtime contents.
8. Configure health behavior.
9. Add OCI source/revision metadata.
10. Build and run locally.
11. Verify that the same image can start with two different runtime configurations without rebuilding.

## Stop conditions

Stop and raise a design issue if:

- environment-specific values require a new application build
- a browser config request contains a secret
- Docker requires importing another product's implementation
- the project build output is ambiguous
- a native Node dependency conflicts with the chosen packaging model
