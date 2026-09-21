# ADR-CICD-001 — Single main branch and immutable artifact promotion

- Status: Accepted
- Scope: empFLOWyee platform
- Decision owner: Solution Architecture

## Context

empFLOWyee is one Nx monorepo with seven independently deployable applications:

- marketing-web
- account-web
- account-api
- hcm-web
- hcm-api
- console-web
- console-api

The platform needs DEV, QA and PROD environments, manual UAT, traceable releases, strong environment isolation and low operational overhead for a solo engineering team.

## Decision

### Source control

`main` is the only long-lived source branch.

Feature work occurs on short-lived branches and reaches `main` only through a pull request.

DEV, QA and PROD are not represented by Git branches.

### Release

A merge to `main` creates an immutable release artifact for every affected deployable.

Images are tagged with the full Git commit SHA and stored centrally in Artifact Registry.

No deployment is performed by the release workflow.

### Promotion

Deployments are manually triggered.

A deployment selects:

1. a deployable;
2. the full release commit SHA;
3. a target environment.

The workflow resolves the SHA-tagged image to an immutable digest and deploys that exact digest.

DEV, QA and PROD may therefore run different commits from the history of `main`.

### UAT

QA is a deliberate manual promotion target.

A release remains in QA for UAT until explicitly promoted to PROD.

### Build once

A release is never rebuilt when moving between environments.

Environment-specific behavior must come from runtime configuration and environment resources.

## Consequences

### Benefits

- identical binary tested in DEV, QA and PROD;
- no branch drift between environment branches;
- simple Git history;
- independent deployment state;
- easy rollback to a previously known digest;
- strong traceability from Git SHA to Artifact Registry digest to Cloud Run revision.

### Costs

- runtime configuration must be designed correctly;
- release artifacts must be retained long enough for promotion/rollback;
- database migration compatibility must eventually support staggered environment promotion;
- developers must understand that Git branch state and deployment state are separate concepts.

## Rejected alternative

Long-lived `dev`, `qa`, `main` environment branches were rejected because merge commits and branch drift make them poor representations of promotion state and weaken build-once/deploy-many.
