# Cloud Run foundation validation

Validated locally on 2026-09-22 with Terraform 1.16.3 and locked Google provider 8.3.0.

- DEV, QA and PROD Cloud Run roots initialize offline and validate.
- All 39 Cloud Run plan-only mocked tests pass after the web-access correction: 15 DEV, 12 QA and 12 PROD; no live resource is created by these tests.
- The existing DEV foundation's three mocked tests pass with the deployer import covered by a resource override.
- Terraform formatting, actionlint/ShellCheck, the Cloud Run structural verifier, tooling ESLint, and architecture/documentation checks pass.
- The module permits public invocation only for the four approved DEV web services and rejects it for APIs and other environments. It also rejects mutable bootstrap tags and TCP liveness. Roots reject foreign environments/projects/state prefixes and runtime identities.
- The pinned Google hello image responds with HTTP 200 on both configured health paths.
- Remote initialization succeeds for shared, DEV foundation and DEV Cloud Run states.
- Shared apply completed: 12 additions, 0 updates, 0 deletions. A fresh live plan reports no changes.
- DEV foundation apply completed: 1 import, 28 additions, 1 descriptive metadata update, 0 deletions. A fresh live plan reports no changes.
- DEV remote-state outputs contain exactly the seven expected runtime identities.
- DEV Cloud Run apply created seven private services, then updated only three Angular API endpoint configurations. All use dedicated identities, Mumbai region, 0–2 instances, 1 CPU/512 MiB, HTTP health probes and latest-revision traffic.
- Approved shared/DEV folder placement and IAM cleanup are verified; the temporary organization Folder Creator grant is absent, as are the four legacy deployer roles and old federation binding.
- GitHub PR CI passed, including all seven Terraform roots on Linux after adding their signed provider package checksums. All 12 CI helper tests pass.
- Seven real images passed publication smoke tests and all seven manual DEV promotions succeeded for release `09e146c24830720d89692194307c2cfe837dec77`.
- All seven latest revisions match the published digests. The initial private deployment passed authenticated application/health checks; its anonymous requests returned HTTP 403.
- The browser-access correction in [PR #5](https://github.com/alarhoo/empflowyee/pull/5), commit `50b63fe`, changed only four web invocation settings in place. Ordinary browsers rendered all four welcome screens; anonymous page, runtime-config, health and asset checks passed. APIs still return 403 anonymously and the expected application response to an authorized caller. No images or runtime identities changed, and the post-apply DEV Cloud Run plan reports no drift.
- Fresh shared, DEV environment and DEV Cloud Run plans report no changes after image promotion. QA/PROD project parents and resources are unchanged.

Shared and DEV foundations and the first DEV application release are complete. QA/PROD had only offline Terraform checks. GitHub has a protected main branch and configured `cicd`/`dev` environments. Release builds are enabled; infrastructure automation remains disabled. See [deployment evidence and access instructions](docs/platform/engineering/dev-deployment.md) and [foundation readiness](docs/platform/engineering/cloud-run-readiness.md).

Repeat commands are in [APPLY-TO-REPO.md](APPLY-TO-REPO.md). Prior application/container verification remains recorded in [container validation](docs/platform/engineering/container-validation.md).
