# Apply to the empFLOWyee repository

Extract this bundle over the repository root.

Do not delete existing production libraries automatically. Treat existing Theme Lab/Storybook code as migration candidates and follow the cleanup plan in the TDD.

Recommended implementation order:

1. Read `docs/hcm/fdd/FDD-HCM-UX-FOUNDATION-LAB.md`.
2. Read `docs/hcm/tdd/TDD-HCM-UX-FOUNDATION-LAB.md`.
3. Read the ADR and theme/control specs.
4. Give Codex `CODEX-IMPLEMENTATION-PROMPT.md`.
5. Implement the lab inside the existing HCM Angular app as a lazy feature.
6. Run the acceptance criteria in `docs/hcm/ux/theme-lab/ACCEPTANCE-CRITERIA.md`.
7. Only after this lab looks production quality should reusable floorplan libraries be extracted.

The implementation must not create a new deployable app.
