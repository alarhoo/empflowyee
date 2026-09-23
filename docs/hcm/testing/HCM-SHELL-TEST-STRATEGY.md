# HCM Shell Test Strategy

## Pure unit tests

- catalog projection by entitlement
- catalog projection by permission
- feature flag projection
- theme precedence
- locale precedence
- stable navigation ordering
- route catalog id lookup
- tenant hostname parsing utility (presentation only)

## Angular integration tests

- runtime state transitions
- unknown tenant state
- suspended state
- auth-required state
- ready shell
- unauthorized route handling
- lazy route loading
- Space/Page navigation projection

## API tests

Tenant discovery:

- known host
- unknown host
- suspended tenant
- pre-auth response has no privileged fields

Session:

- unauthenticated -> 401
- authenticated -> typed runtime context
- tenant membership mismatch rejected

Tenant context:

- query/body `tenant_id` cannot override request-scoped context

## Contract tests

Frontend and backend compile against the same runtime-neutral DTO contracts.

## End-to-end later

The implemented Chromium suite exercises production shell states, native navigation, direct-route denial, all four themes, tenant overlay removal, responsive canvas and accessibility through intercepted runtime HTTP responses. Existing Foundation Lab tests also run. See the [validation record](HCM-SHELL-VALIDATION.md) for commands and scope.

When authentication adapters and Cloud Run ingress exist:

- tenant host -> branded login
- authenticated login -> shell ready
- direct unauthorized route -> access denied
- session expiry -> re-auth journey
