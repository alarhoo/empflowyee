-- Identity-access owns user_account. Approved access-control assignment commands
-- advance its optimistic revision under the shared tenant administration lock.
-- No account identity, enablement, tenant ownership or RLS policy is changed.
GRANT UPDATE (revision) ON hcm.user_account TO hcm_runtime;
