# Attendance time foundation review and validation

Reviewed and executed locally on 2026-09-28. This slice implements the shared
ScheduleDraft parser and pure dated interval calculations. Attendance persistence,
configuration APIs, source cases, workers and UI apps remain pending.

The Attendance TDD precision paragraph is reviewed under the existing
[technical finalization delegation](../roadmap/HCM-3-DESIGN-APPROVAL.md#authority).
It defines the previously unnamed overlapOffset value shape as independent
Earlier/Later choices for start/end, the start-day derivation for contiguous
segments, and the server-only Temporal dependency. These represent the approved
cross-midnight/DST behavior without changing DEC-HCM3-003/004, adding split shifts,
inventing minimum rest or silently choosing an occurrence. This is a Codex
technical review, not an additional human approval claim. Only Attendance DOMAIN
review hashes are refreshed for this precision change.

`pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts` runs the
contract/domain suites. The 14 focused tests pass:

- Exact text and millisecond preservation; unknown fields/ownership, enum and
  length limits, real dates, conditional configuration and all seven weekdays.
- Split/overlapping segment rejection and explicit breaks after midnight.
- New York spring gap and both fall overlap choices, with offset mismatch denial.
- Lord Howe's half-hour transition and Samoa's skipped civil date.
- Cross-midnight year rollover, leap day, actual DST elapsed duration, and an
  interval crossing the repeated hour with independently chosen endpoints.
- Interval union and overlapping exclusion subtraction without double counting;
  no implicit rest threshold, with explicit Warn/Block behavior only when configured.

`@js-temporal/polyfill` is pinned to 0.5.1 and imported only by the server domain.
The inspected Node 24.21.0 runtime has no native Temporal. The dependency change
adds this package and jsbi to the canonical lockfile; frozen installation succeeds.
No global polyfill, browser-to-server import, custom timezone sampling or new
architectural layer is introduced. The
[maintainer release](https://github.com/js-temporal/temporal-polyfill/releases/tag/v0.5.1)
and [Temporal documentation](https://tc39.es/proposal-temporal/docs/timezone.html)
support the disambiguation behavior; tests prove the application's stricter policy.

This evidence does not mark any business app Implemented or certify SQL, HTTP,
responsive/accessibility or production runtime acceptance.

Attendance domain TypeScript, targeted ESLint, architecture and documentation
checks pass. HCM API and worker builds pass after frozen dependency installation.
Readiness was rerun: 23/23 HCM-3 designs and 61/61 admitted designs pass with zero
blockers; later-capability warnings remain outside the current implementation scope.
