# AI Engineering Layer

This directory contains reusable AI procedures and reserved locations for roles, workflows, templates, and evaluations.

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

The orchestration scaffold will grow as procedures are adopted. Repository documentation remains the architectural and product source of truth.

## HCM procedures

Use the applicable procedure before changing the shell, catalog or theme engine:

- [Theme changes](skills/hcm-theme-change/SKILL.md): preserve the HER source palette, use governed tokens and validate light/dark variants.
- [Navigation catalog changes](skills/hcm-navigation-catalog/SKILL.md): retain stable identifiers and separate visibility from authorization.
- [Floorplan selection](skills/hcm-floorplan-selection/SKILL.md): consult the capability matrix and approved specifications before composing a screen.
- [Build a floorplan](skills/hcm-build-floorplan/SKILL.md): verify native APIs and keep composed layouts domain-agnostic.
- [Storybook stories](skills/hcm-storybook-story/SKILL.md): document reusable UX with fictional fixtures, theme controls and interaction checks.
- [Signal Forms](skills/hcm-signal-form/SKILL.md): implement typed state, validation, save/cancel and server-error mapping.
- [Enterprise tables](skills/hcm-enterprise-table/SKILL.md): declare query ownership and keep HTTP outside presentation libraries.

## Code-change procedure

Before editing code, read `AGENTS.md` and [the canonical code-style policy](../docs/platform/engineering/code-style.md). For every new or changed function, verify its documentation against the implemented behavior, including callbacks and generated scaffold source. Review the diff for missing, stale or placeholder comments, then run the applicable lint checks from that policy. Do not mark AI-generated code complete while documentation lint fails.

For YAML changes, apply that policy's YAML documentation requirements to file headers, workflow jobs and consequential configuration blocks. Validate the workflows with actionlint, check formatting, and distinguish editor diagnostics from actual workflow failures; do not report an editor issue as fixed without addressing its cause.
