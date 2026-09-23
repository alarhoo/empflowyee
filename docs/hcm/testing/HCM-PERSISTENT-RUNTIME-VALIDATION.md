# Persistent HCM-0 database and runtime validation

Verified locally on 2026-09-23 using Node 24.21.0, pnpm 12.5.1 and official
PostgreSQL 17.11 Alpine. This completes the
[approved minimal spine](../domain/PLATFORM-SPINE.md) and
[persistent runtime design](../tdd/TDD-HCM-PERSISTENT-RUNTIME.md).

## Persistent local instance

`pnpm hcm:db:up` provisioned `empflowyee-hcm-postgres` on `127.0.0.1:55432`, with
database `hcm_db`, schema `hcm` and named volume `empflowyee-hcm-postgres-data`.
Credentials remain private in ignored `.local/hcm/database.json`; none is in a
browser bundle or committed file. Both `hcm_migrator` and `hcm_runtime` have
`rolsuper=false` and `rolbypassrls=false`.

Five immutable migrations and four seed versions are recorded. SQL inspection found
19 tables: 15 tenant-owned tables with ENABLE/FORCE RLS, two global routing/catalogue
projections, and two protected history tables. Runtime access is SELECT only.

| Persisted records                                      |         Count |
| ------------------------------------------------------ | ------------: |
| Tenant / exact hostname mapping                        |         1 / 1 |
| Organisations / locations                              |         3 / 2 |
| People / workers / employments / assignments           |        4 each |
| Accounts / account-role grants / personas              |        4 each |
| Roles / discovery permissions / role-permission grants | 4 / 170 / 268 |
| Entitlement definitions / tenant entitlements          |       26 / 26 |

An actual join from account through person, worker, employment, assignment,
organisation and location resolves Jim, Michael and Toby to Scranton and David to
New York Headquarters. Restarting the PostgreSQL container preserved all records.
Repeating `pnpm hcm:db:up` reported zero migrations and zero seed versions applied.
The developer database was never reset during verification.

## API and browser

The real Nest application runs at port 4402 with the restricted database pool.
Requests through the Angular proxy at port 4302 return persisted account/worker
IDs and the unchanged runtime DTO:

| Persona         | Account ID                       | Role                 | Discovery permissions |
| --------------- | -------------------------------- | -------------------- | --------------------: |
| Jim Halpert     | `dunder-mifflin/account/jim`     | employee             |                    39 |
| Michael Scott   | `dunder-mifflin/account/michael` | manager              |                    62 |
| Toby Flenderson | `dunder-mifflin/account/toby`    | hr-specialist        |                    95 |
| David Wallace   | `dunder-mifflin/account/david`   | tenant-administrator |                    72 |

At `http://acme.localhost:4302`, the browser loads Jim's launchpad without production
sign-in. His profile shows the seeded name, email and Dunder Mifflin tenant.
Selecting Michael through the profile dropdown changes the identity and exposes
Employee and Manager navigation. Catalogue inspection exposes all five Spaces
(including Analytics and Administration in the native overflow at a narrow viewport).
Planned application tiles remain planned. These checks used real HTTP requests;
no route interception or fabricated session responses were used.

## Automated checks

`pnpm hcm:db:test` passes 38 tests across five files using a separately provisioned,
disposable PostgreSQL instance. Existing migration, seed, contract and HTTP tests
remain, with six new database-backed runtime scenarios covering:

- Persisted identities/grants, unknown Host/persona denial and workforce joins.
- Permission revocation, entitlement disablement and identity changes reflected in the next API read.
- Disabled account denial, removal from persona choices and tenant suspension denial.
- Another tenant's matching persona selector resolving only its own identity and grants.
- Missing-context RLS denial, cross-tenant FK rejection, runtime write/role-escalation denial and cleared transaction context.
- Optional accounts, multiple employments/assignments and local-only activation without fixture fallback.

Validation also includes affected API library lint, tooling lint, TypeScript checks,
browser runtime/catalogue regressions, changed-file formatting, architecture and
documentation checks, canonical catalogue/seed projection checks and production
builds of `hcm-api` and `hcm-web`.

## Scope

Production authentication, production database deployment/synchronization, business
API permissions, employment lifecycle and effective-dated changes remain deferred.
No business application was added. The Account-owned tenant/commercial fields are
local projections; this work does not change cross-product data ownership.
