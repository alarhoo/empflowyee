# empFLOWyee platform foundation

One Nx/pnpm monorepo contains seven deployables across Marketing, Account, HCM and Console. The container/runtime foundation is implemented and tested locally; see [local run commands](docs/platform/engineering/local-development.md) and [container validation](docs/platform/engineering/container-validation.md).

The Cloud Run Terraform foundation adds one reusable service module and separate DEV, QA and PROD service states. Each deployable has its own runtime identity, private invocation, zero minimum instances and explicit scale caps. Terraform owns service configuration; release workflows promote immutable images and serialize mutations by environment.

The shared and DEV foundations are applied with no drift, including the approved folder placement, immutable registry, restricted federation and seven DEV runtime identities. All seven real apps are now deployed privately to DEV and verified. See [service URLs and deployment evidence](docs/platform/engineering/dev-deployment.md) and [foundation readiness](docs/platform/engineering/cloud-run-readiness.md). QA/PROD remain unchanged.

Start with [the apply guide](APPLY-TO-REPO.md), [validation results](VALIDATION.md) and [next steps](NEXT-STEPS.md). Product and architecture truth remains under [docs/](docs/README.md).
