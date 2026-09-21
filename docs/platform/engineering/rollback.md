# Rollback strategy

Identify the previous known-good main commit SHA that already has an Artifact Registry image for the deployable.

Run the dedicated deploy workflow using that SHA and target environment.

No image rebuild occurs.

## Database caveat

Application rollback is safe only when schema/data changes remain compatible with the older application. Before automated production migrations are introduced, empFLOWyee must define an expand/contract migration strategy and migration sequencing rules.
