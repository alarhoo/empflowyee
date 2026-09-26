-- Ownership: employee. Remove only the tenant policy row this version added.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.profile_field_tenant_policy WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/profile-policy/work-mode';
