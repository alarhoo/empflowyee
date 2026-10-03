-- Ownership: Access Control. Canonical manager/HR personas may read and decide
-- source-owned Attendance slots only under current scope and candidate checks.
-- This does not enable the broader Approve Attendance app or grant Work Schedules curation.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.access_permission(tenant_id,code,description,kind)
VALUES ('local-dunder-mifflin','hcm.attendance.approve-attendance.read','Read scoped Attendance source approval cases and own decision receipts','business-operation'),
       ('local-dunder-mifflin','hcm.attendance.approve-attendance.decide','Decide an exact current independent Attendance approval slot','business-operation');
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code)
SELECT 'local-dunder-mifflin',r.role_id,p.code FROM
  (VALUES ('manager'),('hr-specialist')) AS r(role_id)
  CROSS JOIN hcm.access_permission p
WHERE p.tenant_id='local-dunder-mifflin' AND p.code IN
  ('hcm.attendance.approve-attendance.read','hcm.attendance.approve-attendance.decide');
