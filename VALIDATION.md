# CI/CD foundation validation

## Local review results — 2026-09-21

Validated on Windows with Node 24.19.0 (within the declared engine range) and
pnpm 12.5.1. GitHub workflows use the repository's pinned Node version.

- Full Nx lint/test/build: 24 tasks passed across 14 projects, without cache hits.
- CI helpers: zero ESLint warnings and all 10 tests passed.
- Workflow validation: actionlint 1.7.12 with ShellCheck 0.11.0 passed.
- Changed-file formatting, architecture, documentation and deployment manifest checks passed.
- Git credential/state ignore checks and the final whitespace check passed.

## Repeat the checks

Run from the repository root with the Node version in `.node-version` and the
pnpm version declared in `package.json`:

```bash
node tools/architecture/verify.mjs
node tools/documentation/verify.mjs
node tools/ci/validate-deployables.mjs
pnpm exec eslint tools/ci --max-warnings=0
node --test tools/ci/*.test.mjs
actionlint
pnpm nx format:check --base=main --head=HEAD
pnpm nx run-many -t lint test build
```

PR CI runs the architecture/documentation/manifest checks, CI-helper lint/tests,
actionlint 1.7.12, changed-file formatting and Nx affected lint/test/build. The
full run-many command is available for repository-wide verification.

The helper tests cover affected-app filtering, malformed release inputs, mainline
ancestry, missing prerequisites, immutable registry enforcement, build retries,
registry permission failures, missing artifacts/services and image-only promotion.
GCP and Docker commands are simulated in these tests; no cloud resource is changed.

Workflow validation includes reusable-workflow inputs and expressions. Local
Windows actionlint can use `-shellcheck=` when ShellCheck is unavailable; the
Ubuntu PR job also checks embedded shell scripts with ShellCheck.

Git ignore checks cover generated Google credentials and Terraform state/plans.
The Docker context excludes these files and local environment/configuration values.

## Remaining external validation

GitHub-hosted execution, WIF/IAM, Artifact Registry behavior, container builds,
Terraform apply and Cloud Run deployment have not been exercised against a live
environment by this review. There are no production Dockerfiles or Terraform roots
yet. Keep release enablement unset or false until the
[activation prerequisites](APPLY.md) are met, then demonstrate DEV, QA, PROD and
rollback with the same digest as listed in the
[foundation plan](docs/platform/engineering/ci-cd-foundation-plan.md).
