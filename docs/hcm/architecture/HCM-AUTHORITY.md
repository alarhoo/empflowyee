# HCM authority model

The empFLOWyee repository contains the complete current HCM engineering context.

Follow the repository [constitution](../../../AGENTS.md#source-of-truth-order):

1. cross-product architecture and policy under `docs/platform/`;
2. current product-specific truth under `docs/hcm/`;
3. accepted ADRs;
4. approved FDDs;
5. approved TDDs;
6. implementation and tests;
7. `.ai/` procedures, which never duplicate product truth.

The [app catalogue](../catalogue/hcm-app-catalogue.json) and
[launchpad](../catalogue/hcm-launchpad.json) own current product metadata.
Catalogue readiness flags are summaries, not substitutes for approval of actual documents.
Only current approved requirements/design documents are implementation inputs.

If documents conflict, stop and reconcile the authoritative documents before implementation. Do not carry historical provenance fields into current metadata.
