# empFLOWyee HCM-2 Domain Authority v1.0.0

## Implemented screen updates

Org Chart provides a connected D3 hierarchy and the native Tree view, selected
with Chart / Tree controls. Both use the same paged API and person details.
See the [Org Chart design](docs/hcm/apps/org-chart/TDD.md#connected-chart-composition)
and [validation record](docs/hcm/testing/HCM-2-ORG-CHART-VALIDATION.md) for scope and checks.

This overlay promotes the detailed HCM-2 business/data-model knowledge into **current repository authority** without carrying historical implementation provenance.

It covers:

- Workforce Foundation
- Employee
- Job Architecture
- HCM-2 scope and decision register
- compatibility with the existing HCM-0/HCM-1 PostgreSQL spine
- an updated Claude HCM-2 Step 1 preparation prompt

## Apply

Extract over the repository root, then run:

```bash
node tools/hcm-factory/validate-hcm2-domain-authority.mjs
```

Then ask Claude:

```text
Read CLAUDE.md and execute claude-prompts/02-HCM2-STEP1-PREPARE.md.
```

Claude should prepare/finalize FDD/TDDs and stop for genuine business decisions. It must not implement HCM-2 business code until readiness passes.
