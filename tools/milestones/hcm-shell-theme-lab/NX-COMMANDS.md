# Nx materialization commands

Verified against the installed `@nx/angular` 23.2.1 library schema and `--help` on
2026-09-22. The commands below retain the proposed directory/name/tag map.

Materialization added `--prefix=ef-hcm --linter=eslint --unitTestRunner=vitest-analog
--skipFormat=true --no-interactive` to each invocation. The workspace already
defaults non-buildable libraries to Analog/Vitest; Nx's native Angular runner
requires buildable/publishable libraries. The first invocation installed the
missing common test packages. The remaining four used `--skipPackageJson=true`.
`--skipModule=true` on the first invocation still generated a standalone placeholder,
which was removed when copying the templates. No handwritten project metadata was used.

Do not rerun these generators over the materialized libraries. Follow the
[maintainer guide](../../../docs/hcm/architecture/shell/README.md) for normal development.

```bash
pnpm nx g @nx/angular:library libs/hcm/web/runtime/context \
  --name=hcm-web-runtime-context \
  --importPath=@empflowyee/hcm-web-runtime-context \
  --standalone=true --strict=true --style=scss \
  --tags=product:hcm,runtime:web,domain:identity,type:data-access

pnpm nx g @nx/angular:library libs/hcm/web/navigation/catalog \
  --name=hcm-web-navigation-catalog \
  --importPath=@empflowyee/hcm-web-navigation-catalog \
  --standalone=true --strict=true --style=scss \
  --tags=product:hcm,runtime:web,domain:navigation,type:util

pnpm nx g @nx/angular:library libs/hcm/web/ux/theme \
  --name=hcm-web-ux-theme \
  --importPath=@empflowyee/hcm-web-ux-theme \
  --standalone=true --strict=true --style=scss \
  --tags=product:hcm,runtime:web,domain:ux,type:ui

pnpm nx g @nx/angular:library libs/hcm/web/shell \
  --name=hcm-web-shell \
  --importPath=@empflowyee/hcm-web-shell \
  --standalone=true --strict=true --style=scss \
  --tags=product:hcm,runtime:web,domain:shell,type:shell

pnpm nx g @nx/angular:library libs/hcm/web/ux/feature-theme-lab \
  --name=hcm-web-ux-feature-theme-lab \
  --importPath=@empflowyee/hcm-web-ux-feature-theme-lab \
  --standalone=true --strict=true --style=scss --routing=true \
  --tags=product:hcm,runtime:web,domain:ux,type:feature
```

After generation, replace generated placeholder source with the corresponding template source from this bundle.
