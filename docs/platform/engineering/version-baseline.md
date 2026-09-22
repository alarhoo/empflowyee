# Technology Version Baseline

Repository baseline inspected on 2026-09-22. The dependency lockfile and pin files determine installed versions; this table describes the current checked-in toolchain, not an instruction to install a newer release line.

| Technology                | Baseline                                   |
| ------------------------- | ------------------------------------------ |
| Node.js                   | 24.21.0 (`>=24.15.0 <25`)                  |
| pnpm                      | 12.5.1                                     |
| Nx                        | 23.2.1                                     |
| Angular                   | 22.1.x; `@angular/core` resolves to 22.1.7 |
| Next.js                   | 16.1.7                                     |
| NestJS                    | 11.2.5                                     |
| Fundamental NGX           | 0.64.x                                     |
| UI5 Web Components        | 2.26.x                                     |
| PrimeNG                   | 22.1.x                                     |
| Spartan CLI/Brain         | 1.4.x                                      |
| Terraform                 | 1.16.3                                     |
| Google Terraform provider | 8.3.0 in the committed root lockfiles      |

Inspect resolved framework versions with `pnpm list nx @angular/core next @nestjs/core --depth 0` after a frozen install. Update this table with dependency changes rather than treating it as an independent upgrade target.

## Policy

- Nx plugins are pinned together to the same Nx version.
- Angular framework packages must use one matching patch line.
- Use the current supported Nx version for the active Angular version.
- Fundamental NGX versions must support the active Angular major.
- Framework upgrades require automated migration plus architecture/test verification.
- Do not use `latest` blindly in production CI.

The scaffold script relies on Nx generators to choose compatible framework dependencies rather than manually reproducing every framework package peer dependency.
