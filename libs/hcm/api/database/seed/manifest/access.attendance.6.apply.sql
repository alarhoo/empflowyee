-- Ownership: Access Control. Content classification permissions are separate from
-- Work Schedules read/manage. Only the explicit local time policy administrator
-- receives them; decision candidates and employees receive no content access.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.access_permission(tenant_id,code,description,kind)
SELECT 'local-dunder-mifflin','hcm.attendance.work-schedules.evidence.'||c,
 'Access '||c||' Attendance Override evidence under current dated source scope','business-operation'
FROM (VALUES ('general'),('confidential'),('restricted')) AS classes(c);
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code)
SELECT 'local-dunder-mifflin','tenant-administrator','hcm.attendance.work-schedules.evidence.'||c
FROM (VALUES ('general'),('confidential'),('restricted')) AS classes(c);
