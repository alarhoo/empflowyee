# HCM-3 Holiday publication admission question

DEC-HCM3-024 was raised on 2026-09-28 after implementing the dated resolver.
The Holiday draft/preview contracts contain no timezone or target employment,
and a Draft version cannot have live assignments. Actual DST interpretation and
some partial-interval collisions require the workday's authoritative timezone.
The approved FDD requires unresolved collisions to block publication but does not
state the admission rule for an unassigned reusable calendar.

The pending product-owner question offers: (1) publish after structural and
certain-collision checks, with actual dated DST/collision validation mandatory on
assignment; or (2) require an explicit employment/timezone validation context
before publication. No response has been inferred and no dependent publication
command has been implemented. Existing approved draft/read behavior is independent.

Codex reviewed the decision register, app blueprint and catalogue blocker summary
for accurate pending status under the existing documentation delegation. Refreshed
hashes attest to that record, not product approval of either option. The prior
61/61 readiness results remain historical executed evidence; current readiness
must expose the Holiday Calendars blocker until this decision is resolved.
