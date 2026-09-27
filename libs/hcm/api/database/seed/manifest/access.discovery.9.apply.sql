-- Ownership: access-control. DEC-HCM2-023: tenant administrators discover Employment Changes, where they decide employment change requests; this grants no business permission.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','tenant-administrator','hcm.catalogue.EMPLOYMENT_CHANGES.discover') ON CONFLICT DO NOTHING;
