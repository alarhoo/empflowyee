# empFLOWyee HCM-2 Domain Authority v1.0.0

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
