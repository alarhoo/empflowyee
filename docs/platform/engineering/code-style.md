# Code Style and Linting

The root `eslint.config.mjs` owns `sharedRules` for JavaScript and TypeScript across products. Framework presets and product boundaries remain active.

## Formatting

- Tabs, displayed at two columns, for code indentation; switch cases are indented one level.
- Single quotes, with double quotes allowed when they avoid escaping an apostrophe.
- No optional statement semicolons.
- Same-line opening braces (1TBS); single-line blocks are allowed.
- Spaces inside object braces and after commas.
- No space before ordinary function parentheses. Async arrows and `catch` clauses retain a space for Prettier compatibility. Prefer named functions or arrows over anonymous `function` expressions so both tools agree.

Formatting rules use `@stylistic/eslint-plugin`, the maintained successors to ESLint's deprecated core style rules. Prettier and EditorConfig share the same tab, quote, and semicolon preferences. YAML and Markdown retain their format-specific indentation. Next.js-generated `next-env.d.ts` and build output are excluded from both linting and formatting.

## TypeScript and frameworks

TypeScript-aware rules replace the core redeclaration, unused-expression, unused-variable, and use-before-definition rules. Intentional unused parameters may start with `_`. Application source additionally uses type-aware checks for unhandled/misused promises, consistent returns, and readonly private fields.

Angular retains its component/directive selector and template rules, prefers `inject()`, and requires standalone components and lifecycle interfaces. Zone.js remains enabled as documented in the Angular baseline.

Nest supports decorators, constructor parameter injection, and runtime value imports required by decorator metadata. Do not impose type-only imports or capitalized-constructor rules on injectable classes and decorators. Bootstrap failures must be handled explicitly.

Shared warning-level preferences remain warnings; correctness and architectural violations remain errors. Do not add blanket lint-disable comments to generated source to hide violations.

## Checks

Run `pnpm nx run-many -t lint test build` for project validation. Use `pnpm nx run-many -t lint --fix` to apply available lint fixes and `pnpm exec prettier --write <files>` for formatting. Root configuration and tooling can also be checked with `pnpm exec eslint eslint.config.mjs "tools/**/*.mjs"`.
