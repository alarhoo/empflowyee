-- Ownership: Access Control. Remove only this version's explicit grants;
-- refuse reset when other roles adopted either permission.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
IF EXISTS(SELECT 1 FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin'
  AND role_id NOT IN ('manager','hr-specialist') AND permission_code IN
  ('hcm.attendance.approve-attendance.read','hcm.attendance.approve-attendance.decide')) THEN
  RAISE EXCEPTION 'Attendance approval permissions are in use by other roles';
END IF;
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin'
  AND role_id IN ('manager','hr-specialist') AND permission_code IN
  ('hcm.attendance.approve-attendance.read','hcm.attendance.approve-attendance.decide');
DELETE FROM hcm.access_permission WHERE tenant_id='local-dunder-mifflin'
  AND code IN ('hcm.attendance.approve-attendance.read','hcm.attendance.approve-attendance.decide');
