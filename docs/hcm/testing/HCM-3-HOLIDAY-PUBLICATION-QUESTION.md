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

## Resolution — 2026-09-29

The product owner answered: "Require employment/timezone context before publication".
This supersedes the pending status above. No application acceptance is implied.

Technical implementation uses explicit selected employment context and authoritative
dated Workforce timezone facts; absent or ambiguous facts prevent publication.
Publication must bind and revalidate those facts along with the source revision,
period fences and collision results. Assignment must validate its actual targets.
The calendar does not acquire a guessed timezone or an implicit assignment.

Codex reviewed the decision-register and Holiday blueprint changes against this
answer under the existing technical delegation. Approval hash updates are limited
to these reviewed decision documents and the Holiday blueprint; unrelated stale
approvals are not refreshed.
