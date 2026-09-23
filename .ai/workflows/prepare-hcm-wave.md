# Workflow: prepare HCM wave

1. Run wave-context for the requested wave.
   For HCM-0, use `docs/hcm/roadmap/HCM-0-WORK-BREAKDOWN.md`: it has foundation work packages and intentionally no business apps. Context generation does not approve implementation.
2. Confirm app ownership and prerequisite domains.
3. Compile a blueprint for every app.
4. Finalize FDDs.
5. Finalize TDDs.
6. Resolve all `BLOCKS_THIS_APP` decisions with the user.
7. Review cross-app contracts and domain migrations.
8. Architecture review.
9. Mark the wave `implementation-ready` only after all gates pass.
