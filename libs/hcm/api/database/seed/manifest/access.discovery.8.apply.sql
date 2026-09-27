-- Ownership: access-control. DEC-HCM2-022: HR specialists discover Position Requirements, where they propose requirement variances; this grants no business permission.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','hr-specialist','hcm.catalogue.POSITION_REQUIREMENTS.discover') ON CONFLICT DO NOTHING;
