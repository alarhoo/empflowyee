# Identity Administration feature-identity-administration

Domain-owned Angular implementation consuming universal contracts and real Nest APIs.
See the [approved design](../../../../../docs/hcm/apps/identity-administration/TDD.md).

Native FCL/Object Page composition has no feature CSS. Account actions use bounded Signal Forms dialogs. Contextual roles consume Access Assignments data access and link to its owning screen; no assignment writer is duplicated.

Generated using `@nx/angular:library`, ESLint, no generated tests, and the four ownership tags in project.json. Verify with the project lint target and real-browser identity acceptance suite.
