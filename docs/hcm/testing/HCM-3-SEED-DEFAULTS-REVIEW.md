# HCM-3 seed defaults representation review

Reviewed 2026-09-28 under existing delegated technical finalization. DEC-HCM3-003
approves configurable hours and unpaid minutes, with no approved placement or
timezone. The owning TDD also requires explicit placement/zone before publication,
while ScheduleDraft is a closed complete pattern. Persisting a nine-hour Work
segment as if it represented eight hours, or inventing a noon break, would be wrong.

The revised technical representation stores an incomplete draft form proposal in
separate Attendance seed-default tables and exposes one additive read endpoint.
It is labeled DraftDefaults and contains no date, zone or resolved duration. The
administrator completes or changes it in the create form before the existing
ScheduleDraft command accepts it. Complete drafts retain the same strict schema
and still need preview/publication. No existing public field is weakened and no
source may assign or publish the proposal. The canonical seed's explicit operation
grants match the existing administrator reference-data discovery role; authorization
continues to use persisted grants, never a role-label bypass.

This is technical reconciliation of approved defaults, not a new business policy
or separate human approval. Runtime seed and browser acceptance remain to be tested.
