# Rollback strategy

Identify the previous known-good main commit SHA that already has an Artifact Registry image for the deployable.

Run the dedicated deploy workflow using that SHA and target environment.

No image rebuild occurs.

## Procedure

1. Identify the affected application and environment. Read its current image digest, ready revision and recent deployment runs before making changes.
2. Select the last verified release SHA for that application. Confirm its image still exists in Artifact Registry and that its runtime configuration is compatible with the intended rollback.
3. Dispatch the same `deploy-<application>.yml` workflow from `main`, supplying the previous SHA and the affected environment. Follow the [release runbook](release-process.md#2-promote-one-application).
4. Wait for completion and run the [post-deployment checks](release-process.md#verify-a-deployment), including browser behavior, API access policy and embedded release identity.
5. Record the failed release, rollback SHA/digest, workflow URL, resulting ready revision and verification result in the incident/change record.

The deployment still routes 100% of traffic to the latest ready revision; rollback creates a revision from the earlier image through the normal deployment path. Do not introduce an unmanaged traffic split or rebuild an old SHA tag.

## Limits

An image rollback does not undo Terraform changes, restore deleted data or revert other services. Review configuration changes separately through the owning Terraform root. For a multi-app release, identify exactly which applications need rollback and dispatch them sequentially; there is no cross-service transaction.

The current DEV foundation has no application database. The rollback mechanism is implemented, but the initial release record does not claim a completed rollback drill or QA/PROD production recovery exercise.

## Database caveat

Application rollback is safe only when schema/data changes remain compatible with the older application. Before automated production migrations are introduced, empFLOWyee must define an expand/contract migration strategy and migration sequencing rules.
