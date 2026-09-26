-- Ownership: access-control. DEC-HCM2-019: tenant administrators discover Employee Profile Configuration, which they read; this grants no business permission.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','tenant-administrator','hcm.catalogue.EMPLOYEE_PROFILE_CONFIGURATION.discover') ON CONFLICT DO NOTHING;
