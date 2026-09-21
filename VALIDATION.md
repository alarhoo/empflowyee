# Cloud Run foundation validation

Validated locally on 2026-09-22 with Terraform 1.16.3 and locked Google provider 8.3.0.

- DEV, QA and PROD Cloud Run roots initialize offline and validate.
- All 33 Cloud Run plan-only mocked tests pass; no live resource is created by these tests.
- The existing DEV foundation's three mocked tests pass with the deployer import covered by a resource override.
- Terraform formatting, actionlint/ShellCheck, the Cloud Run structural verifier, tooling ESLint, and architecture/documentation checks pass.
- The module rejects public invocation, mutable bootstrap tags and TCP liveness. Roots reject foreign environments/projects/state prefixes and runtime identities.
- The pinned Google hello image responds with HTTP 200 on both configured health paths.
- Remote initialization succeeds for shared, DEV foundation and DEV Cloud Run states.
- Shared apply completed: 12 additions, 0 updates, 0 deletions. A fresh live plan reports no changes.
- DEV foundation apply completed: 1 import, 28 additions, 1 descriptive metadata update, 0 deletions. A fresh live plan reports no changes.
- DEV remote-state outputs contain exactly the seven expected runtime identities.
- The real Cloud Run DEV plan succeeds: 7 additions, 0 updates, 0 deletions. Reviewed private invocation, dedicated identities, Mumbai region, 0–2 instances, 1 CPU/512 MiB, pinned bootstrap image, HTTP health probes and latest-revision traffic for every service.
- Approved shared/DEV folder placement and IAM cleanup are verified; the temporary organization Folder Creator grant is absent, as are the four legacy deployer roles and old federation binding.
- DEV currently has zero Cloud Run services. QA/PROD project parents are unchanged.

Only shared and DEV environment foundations were applied. Cloud Run apply and application deployment remain pending. The operator created the shared project; this task created its protected state bucket and completed the approved prerequisites. QA/PROD had only offline Terraform checks. GitHub now has a protected main branch and configured `cicd`/`dev` environments; release and infrastructure activation flags remain false. See [readiness, IAM verification and the next steps](docs/platform/engineering/cloud-run-readiness.md).

Repeat commands are in [APPLY-TO-REPO.md](APPLY-TO-REPO.md). Prior application/container verification remains recorded in [container validation](docs/platform/engineering/container-validation.md).
