-- Ownership: access-control/audit. Explicit approved local dataset reset only.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.access_command_receipt WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.audit_event WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.role_permission WHERE tenant_id='local-dunder-mifflin' AND permission_code IN (SELECT code FROM hcm.access_permission WHERE kind='business-operation');
DELETE FROM hcm.access_permission WHERE tenant_id='local-dunder-mifflin' AND kind='business-operation';
