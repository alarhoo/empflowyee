-- Ownership: Access Control. Remove only this version's exact grants. Refuse
-- reset when another role uses these permissions, rather than deleting its grants.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
IF EXISTS(SELECT 1 FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND role_id<>'tenant-administrator'
  AND permission_code IN ('hcm.attendance.holiday-calendars.read','hcm.attendance.holiday-calendars.draft',
    'hcm.attendance.holiday-calendars.preview','hcm.attendance.holiday-calendars.publish','hcm.attendance.holiday-calendars.retire')) THEN
  RAISE EXCEPTION 'Attendance permissions are in use by other roles';
END IF;
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND role_id='tenant-administrator'
AND permission_code IN ('hcm.attendance.holiday-calendars.read','hcm.attendance.holiday-calendars.draft',
  'hcm.attendance.holiday-calendars.preview','hcm.attendance.holiday-calendars.publish','hcm.attendance.holiday-calendars.retire');
DELETE FROM hcm.access_permission WHERE tenant_id='local-dunder-mifflin'
AND code IN ('hcm.attendance.holiday-calendars.read','hcm.attendance.holiday-calendars.draft',
  'hcm.attendance.holiday-calendars.preview','hcm.attendance.holiday-calendars.publish','hcm.attendance.holiday-calendars.retire');
