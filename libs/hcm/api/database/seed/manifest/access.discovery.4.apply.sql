-- Ownership: access-control. DEC-HCM2-018: HR Operations discovers Identification Types and Lookup Values; this grants no business permission.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','hr-specialist','hcm.catalogue.IDENTIFICATION_TYPES.discover') ON CONFLICT DO NOTHING;
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','hr-specialist','hcm.catalogue.LOOKUP_VALUES.discover') ON CONFLICT DO NOTHING;
