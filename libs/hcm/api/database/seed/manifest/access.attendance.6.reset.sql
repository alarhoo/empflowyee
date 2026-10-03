-- Remove only canonical content grants; refuse removal when another role adopted them.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
IF EXISTS(SELECT 1 FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin'
 AND role_id<>'tenant-administrator' AND permission_code IN
 ('hcm.attendance.work-schedules.evidence.general','hcm.attendance.work-schedules.evidence.confidential','hcm.attendance.work-schedules.evidence.restricted')) THEN
 RAISE EXCEPTION 'Attendance evidence grants are in use';
END IF;
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND role_id='tenant-administrator'
 AND permission_code IN ('hcm.attendance.work-schedules.evidence.general','hcm.attendance.work-schedules.evidence.confidential','hcm.attendance.work-schedules.evidence.restricted');
DELETE FROM hcm.access_permission WHERE tenant_id='local-dunder-mifflin'
 AND code IN ('hcm.attendance.work-schedules.evidence.general','hcm.attendance.work-schedules.evidence.confidential','hcm.attendance.work-schedules.evidence.restricted');
