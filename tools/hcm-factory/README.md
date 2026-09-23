# HCM factory tools

- `validate-catalogue.mjs` — validates the canonical current app/launchpad metadata and rejects historical provenance fields.
- `app-context.mjs --app=APP_CODE` — creates current app context from catalogue + existing current docs.
- `check-readiness.mjs --app=APP_CODE --check` — checks actual document/blueprint approvals, decisions, design selections and traceability.
- `wave-context.mjs --wave=HCM-N` — groups apps in a delivery wave by domain.
- `materialize-hcm-structure.mjs` — creates the complete planned HCM folder tree without creating Nx projects and writes a generated codebase map.

## Run from the repository root

Use the repository-pinned Node/pnpm runtime after `pnpm install --frozen-lockfile`.

```sh
pnpm hcm:catalogue:validate
pnpm hcm:structure:dry-run
pnpm hcm:structure:materialize
pnpm hcm:wave:context --wave=HCM-0
pnpm hcm:app:context --app=EMPLOYEE_DIRECTORY
pnpm hcm:factory:test
pnpm hcm:app:readiness --app=EMPLOYEE_DIRECTORY --check
```

Validation checks canonical identities, domain-owned feature paths, invariant
policy fields, route/floorplan approval prerequisites and reciprocal launchpad
references, including business catalogues and roles. It exits nonzero on invalid
metadata; it does not certify FDD/TDD approval or business completeness. Maintain
the supplied schema alongside future metadata format changes.

The materializer validates before writing. It creates empty directories and
refreshes only `docs/hcm/architecture/HCM-CODEBASE-MAP.generated.md`; existing
implementation files remain untouched. It creates no `project.json`, source stub
or `.gitkeep`. Git does not preserve empty directories, so rerun after cloning.
`--dry-run` writes nothing; `--map-only` refreshes the map without materializing
the planned tree. Repeated runs produce the same map.

Context artifacts go to ignored `.tmp/hcm-factory/`. Paths resolve from the tool
location, independently of the caller's working directory. Unknown apps/waves
fail without writing output. HCM-0 intentionally contains zero business apps and
links its foundation design/work breakdown. App/wave contexts now include the
executable readiness report. `--check` fails for missing/unapproved evidence;
HCM-0 cannot pass an empty business-app check. Current planned apps are expected
to remain blocked. See [readiness evidence format](../../docs/hcm/engineering/APP-READINESS.md).

CI uses `pnpm hcm:app:readiness --admitted --check`: it checks apps claiming approval
or implementation, including existing canonical feature projects. It does not demand
that every planned app be approved. Readiness is a document-input gate, not a
replacement for human review, implementation tests or deployment approval.

If validation fails, correct the owning canonical document or approved metadata
before rerunning. These commands do not change databases, deployment or approval
state. Generated contexts can be regenerated; the tracked map is restored through
normal source control. No database rollback or cloud credentials are needed.

## Runtime catalogue and local launchpad

`pnpm hcm:catalogue:generate` validates all three canonical catalogues and updates
the typed runtime-contract projection. Never hand-edit generated metadata.
`pnpm hcm:catalogue:check` rejects drift and runs inside `pnpm docs:check`.
Neither command materializes folders or implements business apps.

`pnpm dev:hcm-api` uses `start-local-api.mjs` to activate the isolated local tenant
and persona adapters on port 4402. It rejects production/cloud/nonlocal settings.
Run `pnpm hcm:db:up` first to provision/migrate/seed the persistent local database.
Run the web server separately with `pnpm dev:hcm --host=127.0.0.1`, then use
`http://acme.localhost:4302`. See the [shell operation guide](../../docs/hcm/architecture/shell/README.md).

With both servers running, verify real API/bootstrap/persona/catalogue behavior:

```sh
pnpm exec playwright test --config=apps/hcm/web-e2e/local-launchpad.config.mts
```

The separate configuration intentionally uses live local endpoints; the standard
shell browser suite intercepts runtime responses for lifecycle/theme/error cases.
