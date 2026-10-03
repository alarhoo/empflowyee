-- Ownership: Access Control. Admit only implemented Leave draft/enrollment
-- operations for canonical administrators. Discovery and entitlements stay separate.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.access_permission(tenant_id,code,description,kind)
SELECT 'local-dunder-mifflin',code,description,'business-operation'
FROM (VALUES
  ('hcm.leave.leave-policies.read','Read Leave policy drafts and type options'),
  ('hcm.leave.leave-policies.draft','Create and revise Leave policy drafts'),
  ('hcm.leave.leave-administration.read','Read authorized dated Leave enrollments'),
  ('hcm.leave.leave-administration.manage','Admit eligible employment into explicit Leave periods')
) AS permissions(code,description);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code)
SELECT 'local-dunder-mifflin','tenant-administrator',code FROM hcm.access_permission
WHERE tenant_id='local-dunder-mifflin' AND code IN (
  'hcm.leave.leave-policies.read','hcm.leave.leave-policies.draft',
  'hcm.leave.leave-administration.read','hcm.leave.leave-administration.manage');
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code)
SELECT 'local-dunder-mifflin','hr-specialist',code FROM hcm.access_permission
WHERE tenant_id='local-dunder-mifflin' AND code IN (
  'hcm.leave.leave-administration.read','hcm.leave.leave-administration.manage');
