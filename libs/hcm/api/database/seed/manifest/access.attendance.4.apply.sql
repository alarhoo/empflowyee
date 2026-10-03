-- Ownership: Access Control. Explicit Work Schedules operations for the canonical
-- reference-data administrator; discovery and entitlement remain separate.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.access_permission(tenant_id,code,description,kind)
SELECT 'local-dunder-mifflin','hcm.attendance.work-schedules.'||operation,description,'business-operation'
FROM (VALUES ('read','Read schedules, shifts, policies and resolved workday inputs'),
  ('draft','Create and revise schedule, shift and policy drafts'),
  ('preview','Review schedule, shift and policy publication impact'),
  ('publish','Publish reviewed schedules, shifts and policies'),
  ('retire','Retire a published schedule, shift or policy'),
  ('manage','Assign dated schedules and policies and manage approved overrides')) AS permissions(operation,description);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code)
SELECT 'local-dunder-mifflin','tenant-administrator',code FROM hcm.access_permission
WHERE tenant_id='local-dunder-mifflin' AND code IN (
  'hcm.attendance.work-schedules.read','hcm.attendance.work-schedules.draft',
  'hcm.attendance.work-schedules.preview','hcm.attendance.work-schedules.publish',
  'hcm.attendance.work-schedules.retire','hcm.attendance.work-schedules.manage');
