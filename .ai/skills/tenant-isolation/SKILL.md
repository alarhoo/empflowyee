# Tenant isolation

For every DB/API change, identify tenant ownership, SQL policy, runtime tenant context, authorization and negative cross-tenant tests. Runtime DB role must not bypass RLS. Never trust route/hostname alone as authorization.
