# Commit and PR title convention

empFLOWyee uses squash merging. Therefore the **PR title becomes the durable mainline commit message**.

Use:

```text
<type>(<scope>): <imperative outcome>
```

Examples:

```text
feat(hcm-leave): add leave application workflow
feat(account-onboarding): capture organisation branding
fix(hcm-employee): respect work-location filter
docs(platform): document release promotion model
refactor(hcm-api): isolate employee repository adapter
ci(platform): add manual Cloud Run promotion
chore(repo): upgrade Nx
```

Allowed types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

PR titles require a lowercase scope using letters, digits or hyphens and a
non-empty outcome. A `!` after the scope marks a breaking change.

Feature-branch commits should also be meaningful. Avoid messages such as `changes`, `fix`, `again`, `final final`, or `codex changes`.
