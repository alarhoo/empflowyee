-- Ownership: access-control. Discovery for apps admitted to the catalogue after the foundation seed.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES('local-dunder-mifflin','hcm.catalogue.ORGANIZATION_STRUCTURE.discover','Organization Structure','catalogue-discovery');
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','tenant-administrator','hcm.catalogue.ORGANIZATION_STRUCTURE.discover');
