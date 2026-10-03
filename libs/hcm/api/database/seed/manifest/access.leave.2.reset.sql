-- Preserve retained Leave evidence and any independent reuse of these grants.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
IF EXISTS(SELECT 1 FROM hcm.leave_request WHERE tenant_id='local-dunder-mifflin') THEN
  RAISE EXCEPTION 'Leave request evidence prevents permission seed reset';
END IF;
IF EXISTS(SELECT 1 FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin'
  AND permission_code IN ('hcm.leave.apply-leave.read','hcm.leave.apply-leave.draft')
  AND role_id NOT IN ('employee','manager','hr-specialist','tenant-administrator')) THEN
  RAISE EXCEPTION 'Leave self permissions are in use by other roles';
END IF;
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin'
  AND permission_code IN ('hcm.leave.apply-leave.read','hcm.leave.apply-leave.draft');
DELETE FROM hcm.access_permission WHERE tenant_id='local-dunder-mifflin'
  AND code IN ('hcm.leave.apply-leave.read','hcm.leave.apply-leave.draft');
