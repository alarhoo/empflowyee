# Scaffold Tooling

The repository ships architecture and documentation before framework-generated boilerplate. Run:

```bash
pnpm install
pnpm scaffold
```

`scaffold` performs:

1. official Nx generation of seven deployables;
2. HCM/Account/Console UI dependency installation;
3. Nest default port patching;
4. architecture/documentation verification;
5. formatting.

The script is designed to fail fast instead of silently improvising when Nx generator behavior changes.

## pnpm dependency build policy

This workspace uses pnpm's `allowBuilds` policy in `pnpm-workspace.yaml`.
Known Nx/Angular/Next build-tool dependencies are explicitly allowed; any new
transitive package that requests an install/build script still fails closed and
must be reviewed before being added to the allowlist.

## Windows / Git Bash

The scaffold runner invokes pnpm through its JavaScript CLI rather than calling
`pnpm.cmd` directly. This avoids the Windows `spawnSync`/`.cmd` failure that can
otherwise surface only as `ELIFECYCLE` when running from MINGW/Git Bash.
