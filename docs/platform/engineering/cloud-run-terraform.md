# Cloud Run Terraform workflow

## Separate state

Environment IAM/bootstrap state remains:

```text
environments/dev
environments/qa
environments/prod
```

Cloud Run service state is separate:

```text
cloud-run/dev
cloud-run/qa
cloud-run/prod
```

The Cloud Run stacks read the runtime service-account map from the existing environment foundation remote state.

Each root validates its fixed environment/project/region and foundation prefix. A remote-state postcondition requires the owning project's complete seven-account map; a readable but empty state is not enough. Provider lockfiles and plan-only mocked tests are committed for all three roots. CI initializes them with the backend disabled and does not acquire cloud credentials.

## Apply order

1. Apply shared CI/CD foundation.
2. Apply the environment foundation so runtime identities exist.
3. Initialize the matching Cloud Run service stack.
4. Run `terraform fmt -check`, `terraform validate`, and `terraform plan`.
5. Review before apply.
6. Apply manually when you intentionally want the private service shells created.
7. Promote real application image digests through the manual release workflows.

## Configuration ownership

Stable non-secret deployment configuration may be managed by Terraform.

Release-specific values such as commit/release identity belong to the release workflow.

Secret **values** live only in Secret Manager. Terraform may later reference secret names/versions; never commit secret values to `.tf`, `.tfvars`, GitHub YAML or application source.

Release images embed the build's `RELEASE_ID`; Terraform leaves that artifact identity unchanged. Before promoting Angular images, populate the root's `api_base_urls` map for `account-web`, `hcm-web` and `console-web` using the matching API service URLs plus `/api`. The map is empty during bootstrap and accepts only HTTPS API URLs without credentials or query strings. Setting a URL grants no invocation permission: the initial services remain private, and browser/API authentication integration is still deferred. See [DEV readiness](cloud-run-readiness.md).
