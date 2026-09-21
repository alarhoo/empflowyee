# Artifact promotion

The canonical release identifier is the full Git commit SHA on `main`.

Affected deployables are built once and tagged with that SHA in Artifact Registry. Deployment resolves that tag to an immutable `sha256:` digest and deploys the digest, never `latest`.

The registry must enforce immutable tags. A build retry reuses an existing SHA tag
instead of rebuilding. Registry permission or lookup errors fail the build; only
an explicit missing-image response permits a first build. Both build and deploy
verify the registry setting before proceeding.

Dispatch workflows from `main`. The release SHA must identify a commit reachable
from `main`, and the selected deployable must have an artifact for that SHA.
Unchanged deployables do not receive a new tag during an affected-only release;
select their last built SHA instead. Promotion never builds a missing artifact.

## Manual lifecycle

1. merge PR -> build immutable release artifacts;
2. manually deploy release to DEV;
3. verify;
4. manually deploy the same release to QA;
5. perform UAT;
6. manually deploy the same release to PROD.

DEV, QA and PROD may run different mainline commits at the same time.

## Rollback

Redeploy a previously known-good release SHA/digest. Do not rebuild old source as the normal rollback mechanism.
