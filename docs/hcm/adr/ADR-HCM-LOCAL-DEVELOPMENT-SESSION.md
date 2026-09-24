# ADR: isolated local HCM development sessions

Status: accepted for HCM-0; extended for the approved HCM-1 local business stage.

## Decision

The local HCM development launcher opts into a server development session adapter
using `APP_ENVIRONMENT=local` and `HCM_LOCAL_SESSION=true`. Activation requires a
development/test Node process, no cloud runtime identity and the existing local
tenant-directory port. The persisted adapter requires a literal-loopback
`hcm_runtime` connection to the marked local `hcm_db`. Every session read
additionally requires a loopback peer.
Production and other environments retain unconfigured, fail-closed session ports.

`acme.localhost` resolves through the existing tenant directory to the fictional
Dunder Mifflin development tenant. Default session is Jim Halpert. Approved seed
modules persist the Jim, Michael, Toby and David personas and their accounts/grants;
the API queries them on each session read. A client cannot submit
permissions, entitlements or a tenant identity. An optional
`X-HCM-Development-Persona` header selects an allowlisted persona through the existing runtime contract.
HCM-1 business requests use the same verified context and re-read current database
authority inside their transaction. Local writes require the exact configured
`HCM_LOCAL_WRITE_ORIGIN`, JSON content type and same-origin fetch metadata when
present. The launcher defaults the origin to `http://acme.localhost:4302`; a different
local browser origin must be configured explicitly. Unknown selections are denied. There is no cookie mutation,
login endpoint, token persistence or production authentication in this milestone.

The existing session DTO is returned. Its optional `development` presentation
extension advertises server-controlled persona choices and catalogue inspection.
The browser runtime facade alone sends the header; features have no development
authorization branches. Selection stays in memory and reload restores Jim.

This opt-in local mechanism is an authentication substitute only for development
infrastructure. It must never be deployed as an authentication provider. The normal
tenant lifecycle, membership and expiry checks remain in the application layer.
Business APIs must still independently authorize each request.

## Catalogue discovery versus authorization

Canonical per-app `discoveryPolicy` identifies a catalogue discovery permission
and domain entitlement. These are navigation capabilities, not finalized business
API permission contracts. The seed tooling projects canonical business-role/catalogue
membership into persisted grants; the local adapter queries enabled accounts,
assigned roles, permission grants and tenant entitlements under RLS. Disabling an
account or changing a grant affects the next session read. Roles alone do not pass capability
checks. Inspection mode changes metadata visibility only; it cannot satisfy the
route guard or grant backend permissions.

## Evidence required

Test explicit activation, prohibited environments, non-loopback peers, unknown
personas, wrong tenants, absence of production activation, capability filtering,
all-catalogue inspection and direct-route denial. Verify the real local API and
browser together, without intercepted authentication responses.

## HCM-1 extension

The [implementation approval](../roadmap/HCM-1-IMPLEMENTATION-APPROVAL.md) and
[shared transaction contract](../tdd/TDD-HCM-1-LOCAL-COMMON.md#auth) authorize local
business commands without introducing another authentication provider. The existing
loopback peer, environment and tenant checks remain mandatory. A runtime-owned
browser interceptor scopes persona propagation to same-origin HCM API requests;
features never implement persona-specific authorization. Origin checks mitigate
cross-origin browser writes, not an authorized local process selecting a persona.
Production authentication and external integrations remain deferred.
