# AI Engineering Layer

This directory will contain reusable AI procedures, roles, workflows, templates, and evaluations.

It must **not** become a duplicate knowledge base.

```text
.ai/
├── context/      # maps AI to authoritative docs; no copied truth
├── skills/       # repeatable engineering procedures
├── agents/       # thin specialist role definitions
├── workflows/    # multi-step orchestration
├── templates/    # FDD/TDD/ADR/review templates
└── evals/        # regression tests for AI behavior
```

Full implementation is a later scaffold pass. The repository documentation is already the source of truth these artifacts will consume.

## Code-change procedure

Before editing code, read `AGENTS.md` and [the canonical code-style policy](../docs/platform/engineering/code-style.md). For every new or changed function, verify its documentation against the implemented behavior, including callbacks and generated scaffold source. Review the diff for missing, stale or placeholder comments, then run the applicable lint checks from that policy. Do not mark AI-generated code complete while documentation lint fails.

For YAML changes, apply that policy's YAML documentation requirements to file headers, workflow jobs and consequential configuration blocks. Validate the workflows with actionlint, check formatting, and distinguish editor diagnostics from actual workflow failures; do not report an editor issue as fixed without addressing its cause.
