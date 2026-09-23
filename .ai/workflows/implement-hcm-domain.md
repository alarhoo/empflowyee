# Workflow: implement HCM domain foundation

1. Create domain-scoped feature branch.
2. Confirm approved wave/FDD/TDD inputs.
3. Implement universal contracts needed by the domain.
4. Implement SQL migrations, constraints, indexes, RLS and Dunder Mifflin seed changes.
5. Implement Kysely persistence and NestJS domain/application/transport/module layers.
6. Add API integration and cross-tenant negative tests.
7. Commit in coherent slices.
8. Review before app UI work consumes the domain.
