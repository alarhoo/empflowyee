# Prepare an HCM delivery wave

A wave is an internal delivery batch, not a customer-facing product concept, Nx concept, database schema, or UI hierarchy.

1. Resolve all apps in the requested wave from the canonical catalogue and identify domain prerequisites/shared contracts.
2. AI drafts/finalizes the FDDs and TDDs using current repository authority. The human reviews/approves genuine business decisions; do not ask the human to author routine documentation.
3. Ask only for decisions that materially change business behavior, ownership, compliance, security trust boundaries, or user workflow and cannot be resolved from current docs.
4. Classify non-blocking future concerns into the carry-forward file rather than stopping current work.
5. Finalize every app FDD/TDD required by the wave before that app is implemented. Do not invent behavior to make a readiness gate pass.
6. Review cross-app contracts, domain migrations and implementation order so shared domain foundations are built before dependent apps.
7. Do not turn preparation into implementation. Produce the implementation plan/readiness evidence first.
8. Use one app/domain slice at a time during implementation; never implement a whole wave as one giant commit.
