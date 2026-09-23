# Real-data policy for HCM development

Business screens call real NestJS APIs backed by PostgreSQL.

The canonical local/dev demo tenant is Dunder Mifflin. Its data is loaded through versioned database seed tooling.

Production feature code must not contain arrays of fake employees, leave records, timesheets, payroll entries, etc.

Fixtures remain valid in:

- unit tests;
- integration tests;
- E2E test setup;
- the maintained [Storybook workshop](../ux/storybook.md) and isolated visual tooling, with deterministic fictional inputs and no product API calls;
- explicit database seed generators.

The UI must not know that development data is fictional; it consumes the same API contracts used by real tenants.
