-- Ownership: access-control. Remove only the discovery grant added by this version.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND role_id='tenant-administrator' AND permission_code='hcm.catalogue.EMPLOYEE_PROFILE_CONFIGURATION.discover';
