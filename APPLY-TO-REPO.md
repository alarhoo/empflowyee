# Apply to the empFLOWyee monorepo

Use the root [README](README.md#start-here) to prepare the existing Nx repository.
The [installation report](docs/hcm/engineering/FACTORY-INSTALLATION-REPORT.md)
records the integrated foundation. Preserve existing shell, theme and floorplan
implementation and stronger current policies when updating factory material.

Run:

```bash
node tools/hcm-factory/validate-catalogue.mjs
node tools/hcm-factory/materialize-hcm-structure.mjs
node tools/hcm-factory/wave-context.mjs --wave=HCM-0
node tools/hcm-factory/app-context.mjs --app=EMPLOYEE_DIRECTORY
```

The structure materializer validates metadata, creates empty planned directories
and refreshes the generated map. It never creates Nx project configuration.
See the [tool guide](tools/hcm-factory/README.md) for dry-run behavior and expected
outputs, and [HCM-0 work breakdown](docs/hcm/roadmap/HCM-0-WORK-BREAKDOWN.md) for
the next scoped PRs. Do not start business implementation from an unapproved context.
