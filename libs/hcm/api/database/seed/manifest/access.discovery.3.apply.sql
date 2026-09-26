-- Ownership: access-control. DEC-HCM2-017: HR Operations discovers Organization Structure; this grants no business permission.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','hr-specialist','hcm.catalogue.ORGANIZATION_STRUCTURE.discover') ON CONFLICT DO NOTHING;
