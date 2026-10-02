-- Ownership: Access Control. Explicit holiday calendar operations for the canonical
-- reference-data administrator; discovery and entitlement remain separate.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.access_permission(tenant_id,code,description,kind)
SELECT 'local-dunder-mifflin','hcm.attendance.holiday-calendars.'||operation,description,'business-operation'
FROM (VALUES ('read','Read reusable work schedule holiday calendars and draft defaults'),
  ('draft','Create, revise and copy work schedule holiday calendar drafts'),
  ('preview','Review a work schedule holiday calendar publication preview'),
  ('publish','Publish a reviewed reusable work schedule holiday calendar'),
  ('retire','Retire a reusable work schedule holiday calendar')) AS permissions(operation,description);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code)
SELECT 'local-dunder-mifflin','tenant-administrator',code FROM hcm.access_permission
WHERE tenant_id='local-dunder-mifflin' AND code IN (
  'hcm.attendance.holiday-calendars.read','hcm.attendance.holiday-calendars.draft',
  'hcm.attendance.holiday-calendars.preview','hcm.attendance.holiday-calendars.publish',
  'hcm.attendance.holiday-calendars.retire');
