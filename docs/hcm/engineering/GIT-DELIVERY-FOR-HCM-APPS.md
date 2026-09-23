# Git delivery for HCM apps

Use the repository's existing protected-main strategy and git workflow skill.

Do not implement an entire HCM wave in one giant branch.

Typical branches:

```text
feat/hcm-workforce-foundation
feat/hcm-employee-directory
feat/hcm-org-chart
fix/hcm-employee-directory-search
```

A feature branch should contain coherent commits such as:

```text
docs(hcm-employee): finalize employee directory design
feat(hcm-employee): add employee directory contracts
feat(hcm-employee): add directory SQL read model
feat(hcm-employee): implement directory API
feat(hcm-employee): implement directory UI
test(hcm-employee): add directory integration and e2e coverage
```

Squash merge is preferred, following the [platform Git strategy](../../platform/engineering/git-strategy.md) and [commit convention](../../platform/engineering/commit-convention.md). Keep branch commits coherent for review; the Conventional Commit-style PR title becomes the durable mainline message.
