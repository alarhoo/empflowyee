# Compile HCM app blueprint

Given an app code:

1. run `pnpm hcm:app:context --app=APP_CODE` and inspect its readiness issues;
2. read the canonical catalogue entry;
3. read current approved app FDD/TDD and relevant domain documents;
4. identify domain, route, floorplan, contracts, tables/read models, permissions, tests and Nx projects;
5. produce the blueprint and git branch/atomic commit plan using [the readiness format](../../../docs/hcm/engineering/APP-READINESS.md);
6. reference actual human approval records for the reviewed document revisions; never fabricate reviewer identity or approvals;
7. run `pnpm hcm:app:readiness --app=APP_CODE --check` before business implementation;
8. resolve any implementation-critical business decision with the user. Missing technical evidence is work to complete, not approval to assume.

The blueprint references stable current requirement/design IDs instead of duplicating entire documents.
