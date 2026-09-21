# Skill: empFLOWyee Release Promotion

## Purpose

Use when preparing, deploying, promoting or rolling back an empFLOWyee release.

## Read first

- `docs/platform/adr/ADR-CICD-001-single-main-build-once-promote-many.md`
- `docs/platform/engineering/artifact-promotion.md`
- `docs/platform/engineering/release-process.md`
- `docs/platform/engineering/runtime-configuration-and-secrets.md`
- `docs/platform/engineering/rollback.md`

## Invariants

- merge to `main` builds but does not deploy;
- deployment is manual;
- release identity is the full main commit SHA;
- DEV/QA/PROD may run different main commits;
- never rebuild during promotion;
- never deploy `latest`;
- deploy exact Artifact Registry digest;
- runtime secrets come from GCP Secret Manager;
- QA is the UAT environment before PROD.

## Procedure

1. confirm the deployable exists in `ci/deployables.json`;
2. confirm the release artifact exists;
3. identify the current target-environment release;
4. resolve tag to immutable digest;
5. deploy that digest;
6. verify latest-ready Cloud Run revision;
7. record SHA, digest and revision;
8. do not advance another environment unless explicitly requested.

## Stop conditions

Stop when the artifact does not exist, promotion would require a rebuild, environment config is being pushed into the Docker build, database rollback compatibility is unknown after schema changes, or an unreviewed infrastructure mutation is required.
