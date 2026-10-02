-- Remove only this seed version's operation definition and administrator grants.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND role_id='tenant-administrator'
AND permission_code IN ('hcm.attendance.holiday-calendars.manage','hcm.catalogue.HOLIDAY_CALENDARS.discover');
DELETE FROM hcm.access_permission WHERE tenant_id='local-dunder-mifflin' AND code='hcm.attendance.holiday-calendars.manage';
