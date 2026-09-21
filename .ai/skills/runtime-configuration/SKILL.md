# Skill: runtime configuration

## Goal

Change configuration without changing the immutable application image.

## Classification

Before adding a value classify it as exactly one of:

1. build invariant
2. non-secret environment runtime config
3. secret environment runtime config
4. tenant/business configuration
5. user preference

## Ownership

- build invariant -> source code/build metadata
- non-secret environment config -> Terraform/Cloud Run configuration
- secret environment config -> Secret Manager referenced by Cloud Run
- tenant/business config -> PostgreSQL/domain model
- user preference -> PostgreSQL/user preference model

## Browser rule

Anything sent to a browser is public.

## Validation

All runtime configuration must have a typed/validated contract. Missing required values must produce an explicit startup/bootstrap failure.
