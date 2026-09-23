# HCM Shell Security Invariants

## TENANT-HOST-001

The browser hostname is a tenant hint for presentation. HCM API establishes authoritative tenant context from trusted ingress/session information.

## TENANT-ID-002

`tenant_id` supplied in URL/query/body must never override server request tenant context.

## AUTHZ-001

Frontend navigation/route guards are not security controls. Every protected backend operation independently authorizes access.

## SESSION-001

Do not persist provider/session access tokens in browser localStorage.

## SESSION-002

Target architecture uses secure HttpOnly browser session cookies for HCM API sessions.

## SESSION-003

Cookie-authenticated state-changing APIs require an explicit CSRF strategy.

## CATALOG-001

Catalog visibility must not reveal unlicensed/forbidden feature routes beyond ordinary client application metadata, and it must never be treated as backend authorization.

## PREAUTH-001

The public tenant-discovery endpoint returns only data safe before authentication.

## LOG-001

Never log cookies, bearer tokens, IdP assertions, credentials or sensitive employee payloads in runtime/bootstrap logs.

## DEV-SESSION-001

Only the explicit local launcher enables the development session adapter. It
requires local configuration, local tenant discovery, a nonproduction process,
no cloud service identity and loopback requests. The server owns persona
capabilities and tenant membership; the optional selection header carries only
an allowlisted persona ID. Other environments retain fail-closed adapters.

## DEV-CATALOG-001

Inspect-all changes public catalogue visibility only. It does not grant route
access or backend permissions. Discovery capabilities are separate from business
API functions; business operations must still authorize server-side. See the
[local-session ADR](../adr/ADR-HCM-LOCAL-DEVELOPMENT-SESSION.md).
