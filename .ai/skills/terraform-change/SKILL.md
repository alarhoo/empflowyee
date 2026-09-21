# Skill: Terraform change

## Procedure

1. Identify the owning Terraform state/root.
2. Read relevant architecture and security docs.
3. Make the smallest change in the correct root/module.
4. Run `terraform fmt -check`.
5. Run `terraform validate`.
6. Produce and review a plan for the target environment.
7. Check for IAM widening, replacement/destruction, data loss, and billable-resource creation.
8. Update documentation when architecture or operating procedure changes.
9. Apply to DEV first for patterns shared by environments.
10. Never apply PROD merely because DEV apply succeeded; promotion remains explicit.

## Stop conditions

Stop and request an architecture decision if the plan:

- destroys persistent data
- replaces a production database/network boundary
- introduces cross-environment access
- introduces broad IAM (`owner`, `editor`, project-wide secret accessor, etc.)
- creates a new public endpoint
- stores a secret in Terraform source/state unnecessarily
