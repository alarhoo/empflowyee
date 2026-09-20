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
