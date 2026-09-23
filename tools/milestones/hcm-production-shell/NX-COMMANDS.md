# Nx implementation planning

Do not paste these blindly. First inspect existing projects and reuse anything already created by earlier HCM shell/theme milestones.

## Inspect

```bash
pnpm nx show projects
pnpm nx show project hcm-web --json
pnpm nx show project hcm-api --json
pnpm nx graph
```

Search for existing projects under conceptual areas:

```text
libs/hcm/contracts/runtime
libs/hcm/web/runtime
libs/hcm/web/navigation
libs/hcm/web/shell
libs/hcm/api/runtime
```

## Expected project taxonomy

Conceptually, missing projects may need to be generated for:

```text
hcm-runtime-contract
  product:hcm
  runtime:universal
  domain:runtime
  type:contract

hcm-web-runtime-data-access
  product:hcm
  runtime:web
  domain:runtime
  type:data-access

hcm-web-navigation-catalog
  product:hcm
  runtime:web
  domain:navigation
  type:util

hcm-web-access-policy
  product:hcm
  runtime:web
  domain:identity
  type:util

hcm-web-shell
  product:hcm
  runtime:web
  domain:shell
  type:shell

hcm-api-runtime-domain
hcm-api-runtime-application
hcm-api-runtime-infrastructure
hcm-api-runtime-transport
hcm-api-runtime-module
```

Use the repository's existing Nx generator conventions and naming style. Do not introduce a new generator style for this milestone.

## Commands used for this implementation

Existing web context, catalog, shell and theme projects were reused. No new Nx type or boundary exception was needed. From the repository root:

```powershell
pnpm nx g @nx/js:library libs/hcm/contracts/runtime --name=hcm-runtime-contract --importPath=@empflowyee/hcm-runtime-contract --tags=product:hcm,runtime:universal,domain:runtime,type:contract --bundler=none --unitTestRunner=none --linter=eslint --skipFormat --skipPackageJson

foreach ($role in @('domain', 'application', 'infrastructure', 'transport', 'module')) {
  pnpm nx g @nx/js:library "libs/hcm/api/runtime/$role" "--name=hcm-api-runtime-$role" "--importPath=@empflowyee/hcm-api-runtime-$role" "--tags=product:hcm,runtime:api,domain:runtime,type:$role" --bundler=none --unitTestRunner=none --linter=eslint --skipFormat --skipPackageJson
}

pnpm nx g @nx/angular:library libs/hcm/web/runtime/feature-placeholder --name=hcm-web-runtime-feature-placeholder --importPath=@empflowyee/hcm-web-runtime-feature-placeholder --tags=product:hcm,runtime:web,domain:runtime,type:feature --unitTestRunner=none --skipModule --skipFormat --skipPackageJson --prefix=ef-hcm
```

The contract and API module test targets use the existing Nx `run-commands`/Vitest convention. Module integration tests exercise all five backend layers over a real HTTP listener. Application builds compile the non-buildable libraries. Do not rerun these generators against the existing projects.
