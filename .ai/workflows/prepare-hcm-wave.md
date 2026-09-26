# Workflow: prepare an HCM delivery wave

1. Generate/read the requested wave context from the canonical catalogue.
2. Read `docs/hcm/roadmap/HCM-CARRY-FORWARD.md` and apply only items relevant to this wave.
3. Confirm app ownership and prerequisite domains/contracts.
4. AI drafts/finalizes each required app FDD. Ask the human only for genuine unresolved business decisions.
5. AI drafts/finalizes each required app TDD after its FDD is approved, including route, floorplan, contracts, SQL/RLS/Kysely/API/UI/test design.
6. Resolve every `BLOCKS_THIS_APP` item in scope. Record later/non-blocking concerns in the carry-forward file instead of blocking the wave.
7. Review cross-app contracts and domain migration order; identify shared domain foundations that must precede individual apps.
8. Produce a two-level implementation plan: domain foundations first, then app vertical slices with granular branches/commits.
9. Run the wave/app readiness checks. Do not write business implementation code in the preparation step.
