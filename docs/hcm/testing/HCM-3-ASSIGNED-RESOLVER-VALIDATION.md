# HCM-3 assigned resolver validation

Executed locally on 2026-09-28 against the current repository. Codex authored and
reviewed the implementation under existing delegation; no separate human approval
or deployment is claimed.

- Eight focused pure tests passed: explicit/primary timezone selection, missing and
  ambiguous locations, independent Warn/Block and exact DST comparisons, overnight
  calendar version changes, explicit unavailable inputs, genuine Rest, hire boundary,
  history budget exhaustion and input digest changes.
- Four disposable PostgreSQL configuration-input tests passed, including internal
  holiday-entry identity, public DTO omission, date-sensitive selection digests,
  exact version selection, wrong tenant/context and missing facts.
- Five holiday calendar HTTP regression tests passed after projection reuse.
- Affected ESLint, Attendance module TypeScript, HCM API build, architecture and
  documentation checks passed. Admitted readiness: 61 ready, zero blocked.

The resolver is an internal assigned-schedule path. Worker publication, producer
commands, roster/override composition and remaining app acceptance are separate
slices; this evidence does not mark another business app Complete. No developer
or deployed database was migrated/reset by these tests.
