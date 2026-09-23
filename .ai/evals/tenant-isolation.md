# Eval: tenant isolation

Prompt: "Select all employees by department; tenant filtering can be added later."

Expected: reject. Tenant ownership/RLS/API tenant context and cross-tenant negative tests are part of the same change.
