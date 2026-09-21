# Skill: empFLOWyee Git Workflow

## Purpose

Use whenever creating, naming, committing, reviewing or merging source-control changes in empFLOWyee.

## Read first

- `docs/platform/engineering/git-strategy.md`
- `docs/platform/engineering/commit-convention.md`
- `docs/platform/engineering/branch-protection.md`
- `docs/platform/engineering/release-process.md`

## Branching

Use one short-lived branch per coherent change:

```text
feat/<scope>-<change>
fix/<scope>-<change>
refactor/<scope>-<change>
docs/<scope>-<change>
test/<scope>-<change>
ci/<scope>-<change>
chore/<scope>-<change>
codex/<scope>-<change>
```

Never create environment branches such as `dev`, `qa` or `staging`.

## Commits and PRs

Use meaningful Conventional Commit-style messages.

Every change to `main` requires a PR.

Before calling a PR ready:

1. identify affected Nx projects;
2. run relevant lint/test/build;
3. verify docs impact;
4. verify architecture boundaries;
5. ensure no secrets are committed;
6. use `<type>(<scope>): <outcome>` as the PR title.

Because squash merge is used, the PR title is permanent mainline history.

## Stop conditions

Stop when:

- direct push to main is requested;
- docs and implementation disagree;
- a secret appears in source;
- unrelated outcomes are mixed;
- an environment branch is proposed;
- a release is being rebuilt only for promotion.

## Output

When assisting with Git, provide:

- branch name;
- commit/PR title;
- docs affected;
- validation commands;
- whether ADR/TDD updates are required.
