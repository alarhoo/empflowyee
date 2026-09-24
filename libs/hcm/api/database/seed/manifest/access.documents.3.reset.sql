-- Documents own-request discovery only; HR business permissions remain separate.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND role_id IN ('employee','manager','tenant-administrator') AND permission_code='hcm.catalogue.DOCUMENT_REQUESTS.discover';
