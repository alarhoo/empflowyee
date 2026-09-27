-- Ownership: employee. Remove the HR service configuration of this version with every request made
-- under it; migrator deletes bypass append-only runtime grants.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.hr_service_level_target WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.hr_service_request_assignee WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.hr_service_request_attachment WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.hr_service_request_message WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.hr_service_request WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.hr_service_request_sequence WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.hr_service_request_type WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/hr-request-type/%';
DELETE FROM hcm.hr_service_level_policy WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/hr-service-level/standard-1';
DELETE FROM hcm.hr_service_team_membership WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/hr-team/operations/toby';
DELETE FROM hcm.hr_service_team WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/hr-team/operations';
