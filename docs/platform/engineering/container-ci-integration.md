# Container integration with release CI

## Pull request

PR validation may build affected applications but does not publish or deploy production images.

## Main merge / release creation

1. Determine affected deployables through Nx.
2. For each affected deployable, run its Nx build/container target.
3. Tag with the immutable release/commit identifier for traceability.
4. Smoke-test the exact image with two runtime configurations and its embedded release identity. A failure prevents publication.
5. Push to central Artifact Registry.
6. Resolve and record the registry digest.
7. Record the digest in workflow outputs and the job summary; Artifact Registry's immutable commit tag remains the durable lookup.
8. Do not deploy automatically.

## Manual promotion

The dedicated deploy workflow for each deployable receives:

- release ID
- target environment

It reads service/image coordinates from `ci/deployables.json`, resolves the immutable release-SHA tag in Artifact Registry, and deploys the resulting exact digest. Target-environment runtime configuration and Secret Manager references remain owned by IaC. The current pipeline does not store a separate per-release JSON manifest; this aligns with `cicd.md` and avoids introducing a second artifact lookup authority.

`tools/ci/release.mjs` invokes `pnpm exec nx run <project>:docker:build` only when the immutable tag is absent. It passes revision, release and creation metadata as build arguments; deployment environment values are never build arguments. Retries reuse the existing image. Publishing and deployment activation gates are unchanged.

## Nx affected

A change to HCM-only code must not force Account, Console or Marketing images to rebuild unless the Nx graph says they are affected.

## Image tags vs digests

Tags are convenient lookup aliases. The release/deployment record is the digest.
