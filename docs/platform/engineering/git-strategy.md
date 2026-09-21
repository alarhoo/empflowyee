# Git strategy

## Long-lived branch

Only:

```text
main
```

## Working branches

Use small, intention-revealing branches:

```text
feat/hcm-leave-apply
feat/hcm-leave-approvals
feat/account-company-onboarding
fix/hcm-timesheet-filter
refactor/hcm-employee-data-access
docs/platform-cicd
chore/upgrade-angular
codex/ci-platform-foundation
```

Avoid broad branches such as `feature/leave`, `feature/hcm`, `changes`, or personal catch-all branches.

Codex-created working branches use `codex/<scope>-<change>` by default; the same
short-lived scope and PR requirements apply.

## Merge policy

- no direct push to `main`;
- pull request required;
- required CI checks must pass;
- squash merge preferred;
- force push to `main` prohibited;
- branch deleted after merge;
- feature branches should be short lived.

For a solo team, a second-human reviewer is not mandatory. The PR itself still provides review context, CI gating and traceability.

## Pull request boundaries

Prefer one coherent outcome per PR.

Do not bundle unrelated features merely because they happen to be finished at the same time.
