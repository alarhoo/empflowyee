-- Ownership: access-control. Remove only the discovery grants added by this version.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND role_id='hr-specialist' AND permission_code IN ('hcm.catalogue.IDENTIFICATION_TYPES.discover','hcm.catalogue.LOOKUP_VALUES.discover');
