# Job Architecture — Business Rules

1. Designation, job profile, grade, band, position and employment assignment remain separate authorities.
2. Published catalogue/profile/position versions are immutable; correction creates successor versions.
3. Effective ranges for versions of the same aggregate do not overlap; current pointers reference one published version.
4. Job-family hierarchy stays within one catalogue version, cannot self/descendant-cycle and obeys configured maximum depth.
5. Track/level, band/grade and profile references must belong to one compatible catalogue version.
6. Level sequence within a track, band sequence within a catalogue and grade sequence within a band are unique.
7. A job-profile version has at least one allowed grade and exactly one default; a Position Version's grade must be allowed by the selected profile version.
8. Requirement codes are unique within a profile/position version; quantity/unit pairs are valid and non-negative.
9. Waiving a profile requirement preserves the source requirement and requires justification, explicit authority, impact preview and approval.
10. Position headcount capacity is a positive integer and FTE capacity is a positive fixed decimal within configured limits.
11. A published Position Version references effective organization structure, profile version, allowed grade and designation for its effective range.
12. Position relationships cannot self-reference or create cycles for the same relationship type/effective slice.
13. Position relationships and reporting structures never grant authorization.
14. Remaining capacity is derived from exact Position Version capacity and complete effective Assignment occupancy; unavailable occupancy is not zero.
15. A change preview is usable only while ready, unexpired and based on the current source-version digest.
16. Approval evidence applies only to matching tenant/request/version/case/state.
17. Closing/freezing a Position never ends an Assignment; workforce changes are separate transactions.
18. Publishing a new profile default/grade never silently changes existing Position or Assignment evidence.
19. Imports are idempotent and never mutate a published version in place.
20. Downstream contracts specify effective/as-of date, stable public IDs/version and completeness.
21. Job Architecture stores no salary/currency/pay rate/benefit value or compensation eligibility.
22. Hard delete is not a business operation for referenced published architecture; use supersession/retirement/closure.
