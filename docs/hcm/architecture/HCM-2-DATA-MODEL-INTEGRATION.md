# HCM-2 — Data Model Integration Guardrails

## Existing database spine

HCM-0 already created minimal current tables including:

- `hcm.tenant`
- `hcm.organisation`
- `hcm.location`
- `hcm.person`
- `hcm.worker`
- `hcm.employment`
- `hcm.assignment`
- identity/access/entitlement and HCM-1 tables

HCM-2 must **evolve** this spine. It must not create parallel tables such as a second person/worker/employment/assignment aggregate merely because a richer logical model is now available.

Identity Access already owns the implemented `hcm.user_account` lifecycle/session representation. Workforce Foundation may link Person to the existing account model, but HCM-2 must not replace or fork the HCM-1 identity tables.

## Structural ownership

Account Portal owns commercial onboarding, subscription/billing, customer account administration and tenant brand/commercial configuration. HCM consumes the tenant context it needs.

HCM-2 requires Organization/Legal Entity/Org Unit/Department/Location/Designation structure for workforce and positions. During Step 1, explicitly decide which structural facts are:

- Account-owned projections into HCM,
- HCM-owned HR master data,
- or synchronized contracts.

Do not let both applications become independent writers of the same fact.

## Physical-model rules

- Current conceptual entity names are authoritative for meaning, not necessarily physical table spelling.
- Logical `Id`/type annotations in domain docs are not instructions to replace the repository's established opaque ID strategy or current column types. The TDD must reconcile them with existing migrations.
- Preserve existing table identities where practical and use additive/controlled migrations.
- Use public opaque IDs in API contracts; internal numeric/text keys remain persistence details.
- Effective-dated histories require database-enforced non-overlap where the invariant is critical.
- Every tenant-owned table has direct tenant scope and tenant-safe foreign keys.
- RLS policies are created with the table migration and tested negatively.
- Sensitive values require explicit encrypted/masked representation and safe serializers.
- Read projections/materialized views may optimize directory/org-chart/current-worker queries but never become a second source of truth.

## Cross-domain references

Employee may reference Workforce Foundation IDs but cannot own/overwrite those facts directly.
Job Architecture defines Position/Profile/Grade structures; Assignment owns incumbency.
Access Control authorizes operations; reporting relationships are not permission grants.
Documents owns source/upload artifacts; Employee/Job Architecture store references only.
Workflow owns generic approval orchestration when used; domain requests remain owned by their domain.
Audit records evidence without becoming business state.

## Reconciliation result

The Step 1 reconciliation of these guardrails with the applied spine is the
[HCM-2 physical data model](../tdd/TDD-HCM-2-DATA-MODEL.md). It records the
Account and HCM ownership of each structural fact, the logical-to-physical table
mapping, the ordered forward migrations and seed modules, and Kysely ownership.
