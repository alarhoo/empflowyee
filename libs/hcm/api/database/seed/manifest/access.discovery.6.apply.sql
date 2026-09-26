-- Ownership: access-control. DEC-HCM2-020: HR specialists discover Job Catalogue, which they read; this grants no business permission.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','hr-specialist','hcm.catalogue.JOB_CATALOGUE.discover') ON CONFLICT DO NOTHING;
