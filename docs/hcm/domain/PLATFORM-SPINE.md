# HCM platform spine

Status: approved minimal foundation model, following the explicit workforce-model
decision for the persistent HCM-0 runtime milestone.

A person is a human identity within a tenant. A worker links that person to the
tenant's workforce and can have multiple employments. Each employment links the
worker to an organisation and can have multiple assignments. An assignment records
its organisation, location and descriptive job title. Accounts are optional for
people; an account references a person and can hold multiple tenant-scoped roles.
An enabled account is sufficient for this development session mechanism; employment
lifecycle rules are not inferred as authentication rules.

Organisation and location are tenant-owned operational records. Parent organisations
describe the operating hierarchy without inventing legal-entity, payroll, reporting
line, effective-dating or employment-change behavior. Those remain domain design work.

Access-control roles group the existing canonical catalogue-discovery permissions.
They do not grant unapproved business API permissions. Account-role and role-permission
relationships are explicit data. Entitlement definitions are product catalogue
metadata; tenant entitlement grants are a local projection of Account-owned commercial
configuration, not a new HCM licensing authority. Tenant lifecycle, hostname and branding
are likewise HCM runtime projections; [platform ownership](../../platform/architecture/data-ownership.md)
remains unchanged. Production synchronization with Account is deferred.

Development personas reference persisted accounts. Persona selection never supplies
tenant IDs, permissions or entitlement values. Jim Halpert (Employee), Michael Scott
(Manager), Toby Flenderson (HR Operations) and David Wallace (Tenant Administrator)
remain the established local personas. The canonical seed supplies their linked
people, workers, employments, assignments, accounts, roles and entitlement grants.
All workforce values are fictional local demonstration records, not production defaults.

No business application, production authentication, password storage, IdP integration,
employment lifecycle workflow or effective-dated change processing is introduced.
