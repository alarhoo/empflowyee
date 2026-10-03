-- Access owns operation grants. These canonical personas may create/read their
-- own Leave Drafts only; source self checks remain mandatory for every role.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES
  ('local-dunder-mifflin','hcm.leave.apply-leave.read','Read own calculated Leave drafts','business-operation'),
  ('local-dunder-mifflin','hcm.leave.apply-leave.draft','Create own calculated Leave drafts','business-operation');
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code)
SELECT 'local-dunder-mifflin',role.id,permission.code FROM hcm.access_role role
CROSS JOIN hcm.access_permission permission
WHERE role.tenant_id='local-dunder-mifflin' AND role.id IN ('employee','manager','hr-specialist','tenant-administrator')
  AND permission.tenant_id=role.tenant_id AND permission.code IN ('hcm.leave.apply-leave.read','hcm.leave.apply-leave.draft');
-- Preview, submission, approval and entitlement funding are not admitted here.
