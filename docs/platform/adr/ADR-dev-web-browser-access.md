# ADR: Direct browser access to DEV web applications

## Status

Accepted for DEV web applications on 2026-09-22 following the product owner's correction that these are front-facing apps.

## Context

The first deployment kept all seven Cloud Run services behind Google IAM. Although authenticated health checks passed, ordinary browser requests received 403 before reaching the web applications. That does not satisfy browser access to front-facing web apps. A developer proxy is an optional diagnostic tool, not the delivery path for these apps.

This decision supersedes the blanket private-service requirement in the original Cloud Run access baseline for the four DEV web services only. Application authentication and authorization remain separate from Cloud Run invocation.

## Decision

- Allow direct HTTPS browser access to `marketing-web`, `account-web`, `hcm-web` and `console-web` in `empflowyee-dev`.
- Terraform disables the Cloud Run invoker IAM check only for these four explicitly named services. The reusable module keeps a private default and rejects public invocation for other services or projects.
- Keep `account-api`, `hcm-api` and `console-api` IAM-protected until their application authentication/access design is implemented or a separate explicit scaffold-access decision is made.
- QA and PROD retain their existing private configuration. This DEV decision does not authorize their rollout, custom domains, an external load balancer, IAP or changes to runtime identity permissions.
- Preserve existing immutable images, dedicated service accounts, runtime settings and minimum/maximum instance limits.

Public delivery of a frontend does not authorize access to business data. The current web applications contain scaffold screens and public runtime configuration. Account and HCM still require their documented product sign-in and tenant authorization. Console remains an operator-only product: privileged operations and data must be protected by the approved workforce authentication/MFA design before implementation is exposed. Making the DEV Console scaffold reachable does not grant operator privileges.

## Implementation and verification

Use Terraform's `invoker_iam_disabled` setting, following [Google's public access guidance](https://docs.cloud.google.com/run/docs/authenticating/public). Do not add broad project IAM grants or change service-account permissions.

Review a fresh DEV plan showing exactly four in-place invocation changes, with no image, runtime, identity, replacement or deletion changes. Verify all four web roots, runtime configuration and assets without identity tokens in an ordinary browser. Verify that the three API endpoints still require IAM authentication. Confirm a fresh post-apply plan has no drift.

Re-enabling the invoker IAM check through Terraform restores the previous access restriction. Public web delivery alone does not complete browser-to-API integration; keep that limitation explicit until application authentication and browser request handling are implemented.
