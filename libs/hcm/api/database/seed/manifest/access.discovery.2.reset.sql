-- Ownership: access-control. Remove only the discovery rows added by this version.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND permission_code='hcm.catalogue.ORGANIZATION_STRUCTURE.discover';
DELETE FROM hcm.access_permission WHERE tenant_id='local-dunder-mifflin' AND code='hcm.catalogue.ORGANIZATION_STRUCTURE.discover';
