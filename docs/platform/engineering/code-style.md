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

Run `pnpm nx run-many -t lint test build` for project validation and `pnpm lint:tooling` for root configuration, tooling and infrastructure JavaScript/TypeScript. Use `pnpm nx run-many -t lint --fix` to apply available lint fixes and `pnpm exec prettier --write <files>` for formatting. Run `pnpm test:lint-policy` after changing documentation enforcement. PR CI runs the tooling checks and policy tests in addition to affected Nx project validation.

## Mandatory function documentation

Every maintained JavaScript/TypeScript function implementation requires a `/** ... */` JSDoc description immediately before the declaration, method or callback. This includes all apps and libraries, framework lifecycle methods, constructors, getters/setters, arrow functions, nested functions, tests, configuration and repository tooling. Empty functions and one-line callbacks are included. Upstream scaffold output becomes maintained source when committed and must be documented before the change is complete.

Describe the purpose and observable behavior in plain language. Explain significant inputs, return values, errors, side effects and constraints when they are not obvious from the signature. Small callbacks can use a single sentence. Larger functions may use multiple sentences and `@param`, `@returns` or `@throws` where useful; TypeScript comments should not duplicate type annotations already enforced by the compiler. Comments must match the implementation and be updated in the same change as behavior. Avoid placeholder text or merely restating the function name.

```ts
/** Return whether the current user can see this navigation entry. */
function canShowEntry(entry: NavigationEntry): boolean {
	return entry.visible
}

const visibleEntries = entries.filter(
	/** Keep entries permitted by the navigation visibility policy. */
	(entry) => canShowEntry(entry),
)
```

Place method documentation above Angular/Nest decorators. Explain dependency injection in constructor comments, and document the scenario/assertion in test callbacks. Function types, interface signatures and ambient declarations have no implementation and are outside this rule; generated build output and `next-env.d.ts` remain excluded. Intentionally undocumented source strings in lint-policy tests are negative fixtures, not application implementations. Other embedded script functions should be documented in their source strings as well.

The root `sharedRules` uses `eslint-plugin-jsdoc` to make missing documentation and empty descriptions **errors**. Automatic insertion of empty comments is disabled. Do not suppress these rules to accept undocumented code. Lint checks presence and non-empty descriptions; review must still check their accuracy and usefulness.

Shell and PowerShell helper functions also need adjacent purpose comments explaining significant mutations, outputs and failure behavior, using their native comment syntax.

## Mandatory YAML documentation

Every maintained `.yml` and `.yaml` file must start with a purpose comment. GitHub Actions workflows must also explain each job immediately above its job key. Document significant trigger choices, permissions, input/output contracts, environment selection, activation and approval gates, concurrency behavior, reusable-workflow calls and steps with external effects. Explain why a setting exists and what it controls; do not simply repeat the key or add a comment to every obvious scalar.

Keep comments adjacent to the relevant block and update them whenever behavior changes. This applies to AI-authored workflows and pnpm workspace configuration. Generated files such as `pnpm-lock.yaml` are exempt because pnpm owns their contents. Use `actionlint` to validate workflows and Prettier to check YAML formatting after edits. Review must verify that comments match the actual trigger, job and permission behavior.
