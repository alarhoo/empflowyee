-- Explicit local seed reset removes only this version's discovery grant.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND role_id='hr-specialist' AND permission_code='hcm.catalogue.DOCUMENT_TYPES.discover';
