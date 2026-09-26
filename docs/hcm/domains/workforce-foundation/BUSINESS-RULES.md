# Workforce Foundation — Business Rules

1. Person, Worker, Employment and Assignment are separate authoritative lifetimes. There is no authoritative replacement `Employee` table.
2. Every tenant-owned row carries tenant scope and tenant-safe references. Cross-tenant linkage must fail without leaking object existence.
3. Rehire reuses Person and Worker and creates a new Employment. Historical access is never restored automatically.
4. Primary address, employment, assignment and reporting effective-date invariants are database-enforced. Corrections do not silently overwrite history.
5. Reporting Line is a business relationship, not authorization.
6. Worker Event is append-only explanatory evidence for an already validated change.
7. Identification plaintext is never logged, broadly indexed, exported or placed in events. Duplicate detection uses a tenant-keyed non-plaintext mechanism and reveal is purpose-bound.
8. Account deactivation does not delete Person, Worker or historical actor references.
9. Duplicate merges are tenant-local, use one survivor chain and require an explicit correcting operation to reverse mistakes.
10. Current projections identify concurrent contexts explicitly rather than choosing arbitrarily.
11. Lookup rows may be retired but historical codes/meaning remain stable.
12. Retention/disposition is finite and governed separately; an inactive flag is not a retention policy.
13. One Person may have one Worker per Organization in the current product model.
14. Assignment changes close/supersede dated rows; they do not rewrite the prior assignment in place.
15. Work email belongs to Employment.
16. One tenant has one Organization; several statutory employers are Legal Entities under that Organization.
17. Locations are tenant-owned.
18. Designation is title-only and carries no authorization, grade, band, position or compensation meaning.
19. Structural/master rows are retired/deactivated or effective-dated rather than destructively deleted when referenced historically.

## Security and performance invariants

- Forced RLS and negative isolation tests apply to interactive, import, export and background paths.
- Sensitive values use explicit safe serializers and masking.
- Writes use idempotency keys and expected versions where replay/concurrency matters.
- Org-chart/directory reads must be bounded and paginated; do not load an entire large tenant graph into browser memory.
- Audit evidence records actor, purpose and affected identifiers without protected plaintext.
