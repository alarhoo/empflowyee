# empFLOWyee

One pnpm-managed Nx monorepo contains four products and seven deployables:
`marketing-web`, `account-web`, `account-api`, `hcm-web`, `hcm-api`,
`console-web` and `console-api`. Applications compose product-owned libraries;
cross-product integration uses explicit HTTP/event contracts.

## Start here

Use Node 24.21.0 and pnpm 12.5.1, pinned in `package.json`. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec node --version
pnpm dev:hcm --host=127.0.0.1
```

Run the HCM API in a second terminal:

```sh
pnpm dev:hcm-api
```

Open `http://acme.localhost:4302`. The local API launcher establishes the Dunder
Mifflin development tenant and Jim Halpert session. Use the profile button to
switch to Michael Scott, Toby Flenderson or David Wallace, or enable
**Inspect all applications** to explore all five Spaces, 20 Pages and 170 apps.
The appearance button beside the avatar offers Horizon Light/Dark, HER Light/Dark
and Follow device, and remembers your choice
locally. Until a preference is set, appearance follows the device. The anchored
profile dropdown shows identity, email and persona preferences.
Normal persona mode filters navigation by canonical roles and explicit discovery
capabilities. Planned apps open one shared explanation; none has a business
implementation yet, including My Profile.

The Angular proxy preserves Host when forwarding `/api` to port 4402. Local
sessions require isolated local configuration and loopback requests; they do not
configure production authentication. Set `HCM_LOCAL_SESSION=false` before starting
the API to exercise the authentication-required fallback. See the
[shell guide](docs/hcm/architecture/shell/README.md) and
[local-session ADR](docs/hcm/adr/ADR-HCM-LOCAL-DEVELOPMENT-SESSION.md).
Current checks and browser reproduction commands are recorded in
[launchpad validation](docs/hcm/testing/HCM-0-LAUNCHPAD-VALIDATION.md).

Other development commands are `pnpm dev:marketing`, `pnpm dev:account`,
`pnpm dev:console`, `pnpm dev:account-api` and `pnpm dev:console-api`.
See [local development](docs/platform/engineering/local-development.md) for ports,
host mappings and the Docker workflow. Deployed environment readiness is recorded
separately in [DEV deployment](docs/platform/engineering/dev-deployment.md).

## HCM engineering factory

The installed factory provides canonical metadata for 170 apps across 26 domains,
5 Spaces and 20 Pages, context tools and a planned directory map. It does not
implement business apps or domain tables. The running shell consumes a checked,
generated projection of the canonical catalogue. See the
[HCM-0 launchpad design](docs/hcm/tdd/TDD-HCM-0-LAUNCHPAD.md) and
[remaining foundation work](docs/hcm/roadmap/HCM-0-WORK-BREAKDOWN.md).

```sh
pnpm hcm:catalogue:validate
pnpm hcm:structure:materialize
pnpm hcm:wave:context --wave=HCM-0
pnpm hcm:app:context --app=EMPLOYEE_DIRECTORY
```

The materializer creates planned directories and refreshes a tracked codebase
map; it creates no Nx projects or placeholder source files. Git does not preserve
empty directories, so rerun it in a new clone. Context JSON is local generated
output under ignored `.tmp/hcm-factory/`. See the
[tool guide](tools/hcm-factory/README.md),
[catalogue](docs/hcm/catalogue/HCM-APP-CATALOGUE.md) and
[installation report](docs/hcm/engineering/FACTORY-INSTALLATION-REPORT.md).

## HCM UX foundation

HCM uses Angular with maintained Fundamental NGX/UI5 controls. Its independent
[Theme Lab](docs/hcm/ux/theme-lab/README.md) at `/ux/theme-lab` exercises the real
controls, four Horizon/HER themes, tenant branding and responsive behavior with
fictional visual fixtures. Access follows the runtime lab policy; PROD defaults
to disabled. The [Storybook workshop](docs/hcm/ux/storybook.md) renders the same
production UX implementations with deterministic fixtures and no product APIs.

Business features consume approved floorplans and real API data; the shell applies
themes globally. Reusable floorplans retain the
[native page/header/footer and centered canvas standard](docs/hcm/ux/page-layout.md).
Use the [floorplan API guide](docs/hcm/ux/floorplans/README.md) and capability evidence
before adopting a pattern. Directory presence and compilation do not confer UX approval.

## Repository guidance and checks

- [Engineering constitution](AGENTS.md), [documentation index](docs/README.md), [code style](docs/platform/engineering/code-style.md)
- [HCM architecture](docs/hcm/architecture/README.md), [Nx taxonomy](docs/platform/engineering/nx/project-taxonomy.md), [dependency rules](docs/platform/engineering/nx/dependency-rules.md)
- [Deployable topology and diagrams](docs/platform/architecture/deployable-topology.md), [container strategy](docs/platform/adr/ADR-container-runtime-strategy.md)
- [CI/CD](docs/platform/engineering/cicd.md), [release procedure](docs/platform/engineering/release-process.md), [maintainer handbook](docs/platform/engineering/maintenance.md)

```sh
pnpm docs:check
pnpm architecture:check
pnpm lint:tooling
pnpm ux:check-pages
pnpm nx affected -t lint,test,build
pnpm nx format:check --uncommitted
```

Changes reach `main` through reviewed PRs; squash merge is preferred. Artifacts
are built once and manually promoted by immutable digest. PR CI never deploys.
