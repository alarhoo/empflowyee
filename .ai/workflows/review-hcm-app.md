# Workflow: review HCM app

Run the HCM reviewer against FDD/TDD, contracts, migrations, API, UI and tests. Explicitly verify no fixture production data and no theme/custom-CSS pollution in business screens. Verify tenant-isolation negative tests and backend authorization.

Run `pnpm hcm:app:readiness --app=APP_CODE --check` and review the approval provenance
against the actual document revisions. Passing this input gate does not replace
implementation tests or human review. See `docs/hcm/engineering/APP-READINESS.md`.
