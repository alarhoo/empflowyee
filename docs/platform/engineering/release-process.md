# Release process

1. Create a granular feature/fix/docs/refactor branch.
2. Open PR to `main`.
3. PR CI validates; no deployment occurs.
4. Squash merge.
5. `release.yml` uses Nx affected analysis and builds only affected deployables; no deployment occurs.
6. Manually deploy required release SHA to DEV.
7. Verify.
8. Manually deploy the same release SHA to QA.
9. Perform UAT.
10. Manually deploy the same release SHA to PROD.
11. GitHub deployment history, Artifact Registry, Cloud Run revision and Git SHA provide traceability.
