# Runtime and Shell States

The shell must not convert every failure into a generic error page.

## Tenant not found

The hostname does not map to an HCM tenant.

## Tenant suspended/deactivated

Tenant exists, but HCM business feature access is disabled.

## Authentication required

Tenant is valid but no authenticated HCM session exists.

## Access denied

User is authenticated but cannot open the requested feature.

## Bootstrap/runtime error

Unexpected failure while loading tenant/session runtime context.

## Grace/trial notice

Tenant remains usable but the shell may display a non-blocking commercial/status notice sourced from runtime context.
