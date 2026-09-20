# Technology Version Baseline

Baseline validated on 2026-09-21.

| Technology | Baseline |
| --- | --- |
| Node.js | 24.21.x LTS (`>=24.15.0 <25`) |
| pnpm | 12.5.x |
| Nx | 23.2.x |
| Angular | 22.1.x |
| Next.js | 16.3.x |
| NestJS | 12.0.x |
| Fundamental NGX | 0.64.x |
| UI5 Web Components | 2.26.x |
| PrimeNG | 22.1.x |
| Spartan CLI/Brain | 1.4.x |

## Policy

- Nx plugins are pinned together to the same Nx version.
- Angular framework packages must use one matching patch line.
- Use the current supported Nx version for the active Angular version.
- Fundamental NGX versions must support the active Angular major.
- Framework upgrades require automated migration plus architecture/test verification.
- Do not use `latest` blindly in production CI.

The scaffold script relies on Nx generators to choose compatible framework dependencies rather than manually reproducing every framework package peer dependency.
