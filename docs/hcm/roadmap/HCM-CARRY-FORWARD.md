# HCM carry-forward decisions and watchlist

Purpose: keep intentionally deferred decisions visible without polluting current app FDD/TDDs or repeatedly rediscovering them. This is a watchlist, not a replacement for authoritative ADR/FDD/TDD/domain documents. When an item becomes in-scope, resolve it in the owning authoritative document and mark it resolved here.

## Product/app catalogue

- Review app-boundary consolidation after more real HCM usage exists. Notification/preferences/template/rule experiences and similar admin clusters may become one app with internal pages/sections. Do not refactor the current catalogue during HCM-1/HCM-2 solely for consolidation.
- Visual launchpad Space/Page/Section placement never determines code/domain ownership.

## Entitlements and Account Portal

- HCM currently projects entitlements at relatively broad domain/module granularity. empFLOWyee commercial packaging must eventually support bundles and individual apps. Before production licensing, define the Account -> HCM projection that can express the required app/feature granularity without moving commercial ownership into HCM.

## Authentication and external integrations

- Production tenant authentication/SSO integration is intentionally deferred while local development uses the same runtime/session contracts through development personas.
- HCM-1 deferred production-integration apps/capabilities remain deferred until explicitly scheduled: Active Sessions production behavior, API Credentials, Security Policies, SSO Configuration, Email Sender Configuration, and Outbound Webhooks.
- Authorization, tenant isolation, permissions, scopes, entitlements and API enforcement are not deferred.

## Runtime topology

- Seven web/API deployables are the initial product topology, not a permanent cap. Introduce workers/Cloud Run Jobs/event consumers only when a domain has a concrete background-processing requirement and an ADR justifies the new runtime/deployable boundary.
- Recruitment may later require a candidate/public-facing runtime distinct from the internal HCM recruiter apps. Decide when external candidate journeys enter scope.

## UX

- Business apps are theme-agnostic. Feature work uses approved floorplans and maintained semantic controls; it does not implement HER/Horizon behavior or visual theme CSS.
- Storybook/Theme Lab are optional developer tooling and are currently outside normal business-app delivery.
- Semantic data presentation is governed by `.ai/skills/hcm-data-presentation/SKILL.md`.
- Shared accessibility watch items found by HCM-2 axe runs: the three-column FCL separator arrow has no accessible name and nests inside the focusable separator, and the known Display Form definition-list and inverted positive ObjectStatus contrast findings remain. See the [Organization Structure validation](../testing/HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#accessibility-findings-excluded-as-shared).

## Data

- HCM uses SQL-first PostgreSQL, Kysely typed access, one `hcm_db` with main `hcm` namespace, tenant ownership and RLS. Domain boundaries remain in Nx/NestJS architecture, not separate PostgreSQL schemas per domain or tenant.
- Development data such as Dunder Mifflin is real PostgreSQL seed data consumed through NestJS APIs, not production frontend fixtures.

## HCM-2 deferrals

Recorded during HCM-2 preparation on 2026-09-26. Each item names the capability HCM-2 deliberately leaves out.

- **Background runtime.** Automatic execution of future-dated employment-level changes, pushed probation escalations, SLA breach notifications, automatic closure of resolved HR requests and imports above 2,000 rows need a worker or Cloud Run Job. HCM-2 uses explicit Apply commands and read-time states. Decide the runtime through an ADR before any of these is promised.
- **Field encryption.** [ADR-HCM-FIELD-ENCRYPTION](../adr/ADR-HCM-FIELD-ENCRYPTION.md) is Proposed. Positions, Position Requirements and sensitive custom field values cannot ship until it is accepted, and production needs the KMS IaC change it describes.
- **Identification values and statutory data.** Person identification values, identifier-based duplicate matching, statutory nominees and GST registrations wait for a named statutory workflow.
- **Contact verification and invitations.** Personal email and mobile stay unverified, and import creates no invitations, until production authentication and external delivery exist.
- **Profile groups owned elsewhere.** Photos need a governed photo contract. Skills, education, work experience, languages and certifications belong to later Skills work.
- **Duplicate merge depth.** HCM-2 merges only duplicates without an established employment. Merging two engaged histories, and reversing a merge, need a correcting design.
- **Account provisioning handoff.** Initial organisation defaults supplied by Account at tenant provisioning need a synchronized contract; HCM owns the facts afterwards.
- **Identity linkage.** The domain model allows a User Account without a Person, but `user_account.person_id` is NOT NULL today. Revisit when service or external accounts enter scope.
- **Legacy spine column.** `organisation.parent_id` is retained only for the version-1 seed and ignored by HCM-2 reads. Drop it only once that seed is retired through an approved seed-history change.
- **Deferred decisions.** DEC-HCM2-010 (external frameworks), DEC-HCM2-011 (job architecture import), DEC-HCM2-012 (historical display) and DEC-HCM2-013 (retention and legal hold) stay open for later waves.

## Delivery/documentation

- AI drafts FDD/TDDs from current repository authority. The human reviews/approves genuine product/business decisions; routine documentation authoring is not pushed back to the human.
- A delivery wave is only an internal planning batch. Implement domain foundations and apps in granular slices/branches/commits rather than one giant wave commit.
