-- Ownership: Access Control. Explicit template operations for the canonical
-- reference-data administrator; discovery and entitlement remain separate.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.access_permission(tenant_id,code,description,kind)
SELECT 'local-dunder-mifflin','hcm.attendance.work-schedule-templates.'||operation,description,'business-operation'
FROM (VALUES ('read','Read reusable work schedule templates and draft defaults'),
  ('draft','Create, revise and copy work schedule template drafts'),
  ('preview','Review a work schedule template publication preview'),
  ('publish','Publish a reviewed reusable work schedule template'),
  ('retire','Retire a reusable work schedule template')) AS permissions(operation,description);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code)
SELECT 'local-dunder-mifflin','tenant-administrator',code FROM hcm.access_permission
WHERE tenant_id='local-dunder-mifflin' AND code IN (
  'hcm.attendance.work-schedule-templates.read','hcm.attendance.work-schedule-templates.draft',
  'hcm.attendance.work-schedule-templates.preview','hcm.attendance.work-schedule-templates.publish',
  'hcm.attendance.work-schedule-templates.retire');
