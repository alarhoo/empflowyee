-- Reviewed Document Types discovery for HR; this grants no additional business-content permissions.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','hr-specialist','hcm.catalogue.DOCUMENT_TYPES.discover') ON CONFLICT DO NOTHING;
