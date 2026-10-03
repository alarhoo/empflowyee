-- Ownership: Access Control. Preserve real Leave evidence and refuse to remove
-- permissions reused by another role. Reset never discards enrollment history.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
IF EXISTS(SELECT 1 FROM hcm.leave_command_receipt WHERE tenant_id='local-dunder-mifflin')
  OR EXISTS(SELECT 1 FROM hcm.leave_enrollment WHERE tenant_id='local-dunder-mifflin') THEN
  RAISE EXCEPTION 'Leave command evidence prevents permission seed reset';
END IF;
IF EXISTS(SELECT 1 FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin'
  AND permission_code IN ('hcm.leave.leave-policies.read','hcm.leave.leave-policies.draft',
    'hcm.leave.leave-administration.read','hcm.leave.leave-administration.manage')
  AND NOT(role_id='tenant-administrator' OR (role_id='hr-specialist' AND permission_code IN (
    'hcm.leave.leave-administration.read','hcm.leave.leave-administration.manage')))) THEN
  RAISE EXCEPTION 'Leave permissions are in use by other roles';
END IF;
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin'
  AND permission_code IN ('hcm.leave.leave-policies.read','hcm.leave.leave-policies.draft',
    'hcm.leave.leave-administration.read','hcm.leave.leave-administration.manage');
DELETE FROM hcm.access_permission WHERE tenant_id='local-dunder-mifflin'
  AND code IN ('hcm.leave.leave-policies.read','hcm.leave.leave-policies.draft',
    'hcm.leave.leave-administration.read','hcm.leave.leave-administration.manage');
