# HCM Shell + Theme Lab materialization

The supplied milestone has been materialized into five Nx libraries and the existing HCM app. Do not copy the original templates over the implementation or rerun the library generators.

## Run and verify

```sh
pnpm install --frozen-lockfile
pnpm exec node tools/milestones/hcm-shell-theme-lab/verify-bundle.mjs
pnpm dev:hcm:preview
```

Open [Theme Lab](http://127.0.0.1:4303/ux/theme-lab). Follow the [maintainer guide](docs/hcm/architecture/shell/README.md) for the validation commands, fixture controls, library map and troubleshooting.

## Implementation references

- [Approved prompt](CODEX-IMPLEMENTATION-PROMPT.md)
- [TDD and actual adaptations](docs/hcm/tdd/TDD-HCM-SHELL-THEME-LAB.md)
- [Verified Nx generator options](tools/milestones/hcm-shell-theme-lab/NX-COMMANDS.md)
- [HER integrity record](HER-SOURCE-SHA256.txt)
- [Original source templates](templates/hcm-shell-theme-lab/README.md)
- [Next milestone](NEXT-STEPS.md)

The supplied HER palette is unchanged. Reference templates retain the original design shape with repository formatting and function documentation; the working application includes the corrections described by the TDD. Runtime source under `libs/hcm/web` is the implementation to maintain.
