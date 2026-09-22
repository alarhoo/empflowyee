# HCM Application Catalog

The catalog is a stable model of HCM Spaces, Pages, groups, and feature definitions.

It answers presentation questions:

- which Spaces can this principal see?
- which Pages are visible?
- where should a feature be presented?
- what route should launch it?

It does not answer whether an API operation is authorized.

## Visibility inputs

A feature may specify:

- required roles (any-match for UI visibility);
- required entitlements (all required entitlements must be licensed/enabled).

A Tenant Super Admin does not bypass commercial entitlements. It can only see features the tenant owns/enables unless a separately documented platform rule says otherwise.
