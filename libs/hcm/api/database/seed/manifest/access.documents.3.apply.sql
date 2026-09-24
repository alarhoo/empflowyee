-- Documents own-request discovery only; HR business permissions remain separate.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) SELECT 'local-dunder-mifflin',id,'hcm.catalogue.DOCUMENT_REQUESTS.discover' FROM hcm.access_role WHERE tenant_id='local-dunder-mifflin' AND id IN ('employee','manager','tenant-administrator') ON CONFLICT DO NOTHING;
