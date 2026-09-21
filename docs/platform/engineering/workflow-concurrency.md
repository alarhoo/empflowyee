# Cloud Run workflow concurrency

Terraform service changes and release deployments both mutate the same Cloud Run Service resource. They must never race.

## Deployment lock

The reusable deployment workflow serializes by **environment**:

```yaml
concurrency:
  group: cloud-run-${{ inputs.environment }}
  cancel-in-progress: false
```

Any future Cloud Run infrastructure-apply workflow must use the exact same group:

```yaml
concurrency:
  group: cloud-run-${{ inputs.environment }}
  cancel-in-progress: false
```

This intentionally trades some deployment parallelism for correctness. With seven deployables and manual promotions, that is the right tradeoff.

Do not apply a Terraform plan that was produced before a later application deployment. Plan immediately before apply.

The existing `infra-apply.yml` still targets environment IAM/bootstrap roots, uses a separate `terraform-<environment>` lock, and remains disabled pending its identity design. It does not apply Cloud Run stacks. A local operator must coordinate with active deployment runs manually; GitHub concurrency cannot lock a local Terraform process.
