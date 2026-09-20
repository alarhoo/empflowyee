# empFLOWyee Monorepo Foundation

This repository is the foundation for the empFLOWyee SaaS platform.

It is intentionally architecture-first and documentation-first. The repository contains the approved Nx taxonomy, product boundaries, UX architecture, frontend technology decisions, AI instructions, and a deterministic scaffold script that generates the seven runtime applications using Nx generators.

## Product topology

| Product | Frontend | Backend | Production identity |
| --- | --- | --- | --- |
| Marketing | Next.js | none | `https://empflowyee.com` |
| Account | Angular + Spartan | NestJS | `https://account.empflowyee.com` |
| HCM | Angular + Fundamental NGX / UI5 Web Components | NestJS | `https://{tenant}.empflowyee.com` |
| Console | Angular + PrimeNG | NestJS | `https://console.empflowyee.com` |

The HCM frontend is one deployment. Tenant subdomains resolve to the same HCM runtime; the backend resolves and authorizes tenant context.

## Seven deployable Nx applications

```text
apps/
├── marketing/
│   └── web/       # marketing-web
├── account/
│   ├── web/       # account-web
│   └── api/       # account-api
├── hcm/
│   ├── web/       # hcm-web
│   └── api/       # hcm-api
└── console/
    ├── web/       # console-web
    └── api/       # console-api
```

`apps/` contains composition roots and deployables only. Business implementation belongs in `libs/`.

## First run

Prerequisites:

- Node.js 24 LTS, at least `24.15.0`
- Corepack enabled
- Git

Then:

```bash
corepack enable
pnpm install
pnpm scaffold
```

The scaffold command uses official Nx generators to materialize the seven applications with the approved project names, tags, ports, test runners, and Angular compatibility settings.

After generation:

```bash
pnpm architecture:check
pnpm docs:check
pnpm graph
```

## Local development identities

Frontend ports are fixed by architecture:

```text
Marketing       http://empflowyee.com:4200
Account         http://account.empflowyee.com:4300
Console         http://console.empflowyee.com:4301
HCM example     http://acme.empflowyee.com:4302
```

API defaults:

```text
Account API     http://localhost:4400
Console API     http://localhost:4401
HCM API         http://localhost:4402
```

For local named hostnames, see `docs/platform/engineering/local-development.md`.

## Documentation is authoritative

Read `docs/README.md` before implementation. AI instructions and skills may reference documentation but must not duplicate business or architecture truth.

## Current scaffold scope

This foundation intentionally does **not** yet implement:

- domain features such as Employee, Leave, Payroll, etc.
- authentication
- Postgres ORM choice
- tenant persistence
- GCP deployment manifests
- HCM shell/navigation catalog
- floorplan implementations
- final AI agents/skills/workflows

Those are subsequent controlled layers. This repository establishes the boundaries they must respect.
