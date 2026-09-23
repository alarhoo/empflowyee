# Compile HCM app blueprint

Given an app code:

1. run the app-context tool;
2. read the canonical catalogue entry;
3. read current approved app FDD/TDD and relevant domain documents;
4. identify domain, route, floorplan, contracts, tables/read models, permissions, tests and Nx projects;
5. produce a git branch and atomic commit plan;
6. stop if an implementation-critical decision is unresolved.

The blueprint references stable current requirement/design IDs instead of duplicating entire documents.
