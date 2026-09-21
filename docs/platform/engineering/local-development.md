# Local Development

## Node and pnpm runtime

Run `pnpm install` from the repository root before using Nx. The `devEngines.runtime` entry in `package.json` lets pnpm download and use Node 24.21.0 for workspace commands, matching `.node-version` and `.nvmrc`. This avoids using different Node versions from Git Bash, PowerShell and editor terminals. Keep all three pins synchronized when upgrading Node.

Verify the runtime actually used by workspace commands with `pnpm exec node --version`. A bare `node --version` may still report the shell's global runtime; use `pnpm exec node <script>` for repository scripts. This runtime selection uses [pnpm's managed development runtime](https://pnpm.io/package_json#devenginesruntime).

If Nx reports `Invalid regular expression flags` while loading `eslint.config.mjs`, check the runtime before changing lint rules. Node 18 cannot parse syntax used by the lint dependencies, and older Node 22 releases are also outside this repository's supported engine range. After restoring dependencies and the pinned runtime, run `pnpm nx reset --onlyDaemon` to stop the old daemon and clear its workspace data, then retry the command.

## Frontend ports

| Project       | Port | Intended local URL                   |
| ------------- | ---: | ------------------------------------ |
| marketing-web | 4200 | `http://empflowyee.com:4200`         |
| account-web   | 4300 | `http://account.empflowyee.com:4300` |
| console-web   | 4301 | `http://console.empflowyee.com:4301` |
| hcm-web       | 4302 | `http://acme.empflowyee.com:4302`    |

## API ports

| Project     | Port |
| ----------- | ---: |
| account-api | 4400 |
| console-api | 4401 |
| hcm-api     | 4402 |

## Hosts file

For the named frontend URLs, add development-only host mappings:

```text
127.0.0.1 empflowyee.com
127.0.0.1 account.empflowyee.com
127.0.0.1 console.empflowyee.com
127.0.0.1 acme.empflowyee.com
```

A hosts file does not support wildcard domains. Add specific tenant examples as required, or introduce a local DNS solution later.

## Commands

### Run all seven container images

With Docker Desktop running Linux containers, build the images through Nx and start the local Compose stack:

```bash
pnpm nx run-many -t docker:build -p marketing-web,account-web,account-api,console-web,console-api,hcm-web,hcm-api --parallel=2
docker compose -f containers/compose.local.yml up -d --wait --wait-timeout 120
docker compose -f containers/compose.local.yml ps
```

Compose uses the existing Nx-built images and does not build or pull them. All published ports bind to loopback. This runs production builds with public `local` runtime configuration; source edits require another Nx image build followed by the Compose `up` command.

| Product   | Browser URL           | API URL                   |
| --------- | --------------------- | ------------------------- |
| Marketing | http://localhost:4200 | —                         |
| Account   | http://localhost:4300 | http://localhost:4400/api |
| Console   | http://localhost:4301 | http://localhost:4401/api |
| HCM       | http://localhost:4302 | http://localhost:4402/api |

Every app exposes `/health/live` and `/health/ready` on its own port. The Angular containers generate public API URLs matching this table. The current applications display scaffold welcome screens, and each API returns its scaffold greeting; this verifies the runtime foundation, not unfinished business features. No hosts-file changes are needed for these localhost checks.

Inspect logs or stop only this stack with:

```bash
docker compose -f containers/compose.local.yml logs --tail=100
docker compose -f containers/compose.local.yml down
```

### Run individual development servers

Stop the container stack first to free the same ports. These commands provide the framework development servers for source editing:

```bash
pnpm dev:marketing
pnpm dev:account
pnpm dev:console
pnpm dev:hcm

pnpm dev:account-api
pnpm dev:console-api
pnpm dev:hcm-api
```
