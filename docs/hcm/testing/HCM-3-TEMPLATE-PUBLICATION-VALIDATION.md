# HCM-3 template publication validation

Verified locally on 2026-09-28. The template application now previews, publishes
and retires exact versions under distinct current operation permissions. Preview
validates the reusable pattern, not a future employment assignment. It stores
zero live impact with actor/source digest and a 15-minute technical lifetime.
Publication consumes that exact Ready preview and advances the Draft atomically;
retirement preserves copies and immutable published content.

The real PostgreSQL schedule command suite passes ten tests, including five new
publication cases. Concurrent publication retries produce one result; changed
retry payloads conflict. Wrong actor, revoked publication permission, wrong source,
changed digest/revision and historically expired preview fixtures fail. Ordinary
schedules cannot use this template-only path. Out-of-coverage previews and Draft
retirement fail. An unavailable field cipher rolls back preview consumption,
publication, receipt and audit; the original key/preview then succeeds when the
cipher is available. The existing five draft-command cases also remain passing.

The pure Attendance/audit suite passes 35 tests, including two new closed-shape
publication/date-range parser cases. Private reasons are preserved exactly and
remain in encrypted owner receipts. HTTP and UI acceptance are still pending;
these tests do not mark Work Schedule Templates implemented.

The template TDD's explicit single-date omission behavior and preview lifetime
were reviewed under existing delegated technical authority. They bound technical
evidence freshness without changing work patterns, policy defaults or business
approval rules. This review does not claim separate human approval.

Architecture, documentation, TypeScript and targeted ESLint checks pass (one SQL
column-name warning in the database assertion). HCM-3 readiness passes 23/23. The
API build passes from valid local cache; an initial Nx plugin-worker startup
timeout was resolved using the installed Nx in-process plugin option.
