-- Ownership: workforce-foundation. Remove only the rows this version added and return the four
-- version-1 records to minimal spine rows.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.reporting_line WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/reporting-line/jim','dunder-mifflin/reporting-line/dwight','dunder-mifflin/reporting-line/pam','dunder-mifflin/reporting-line/michael','dunder-mifflin/reporting-line/toby');
DELETE FROM hcm.assignment WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/assignment/dwight','dunder-mifflin/assignment/pam','dunder-mifflin/assignment/angela','dunder-mifflin/assignment/oscar');
DELETE FROM hcm.employment WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/employment/dwight','dunder-mifflin/employment/pam','dunder-mifflin/employment/angela','dunder-mifflin/employment/oscar');
DELETE FROM hcm.worker WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/worker/dwight','dunder-mifflin/worker/pam','dunder-mifflin/worker/angela','dunder-mifflin/worker/oscar');
DELETE FROM hcm.person WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/person/dwight','dunder-mifflin/person/pam','dunder-mifflin/person/angela','dunder-mifflin/person/oscar');
UPDATE hcm.assignment SET department_id=NULL,designation_id=NULL,work_mode=NULL,full_time_equivalent=NULL,standard_hours_per_week=NULL,is_primary_assignment=NULL,effective_from=NULL WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/assignment/jim','dunder-mifflin/assignment/michael','dunder-mifflin/assignment/toby','dunder-mifflin/assignment/david');
UPDATE hcm.employment SET legal_entity_id=NULL,employment_type=NULL,employment_status=NULL,hire_date=NULL,employment_sequence=NULL,is_primary_employment=NULL,work_email=NULL,continuous_service_start_date=NULL,probation_end_date=NULL,probation_status=NULL,confirmed_on=NULL,notice_period_days=NULL WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/employment/jim','dunder-mifflin/employment/michael','dunder-mifflin/employment/toby','dunder-mifflin/employment/david');
UPDATE hcm.worker SET worker_type_id=NULL,first_engagement_start_date=NULL,is_currently_engaged=false WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/worker/jim','dunder-mifflin/worker/michael','dunder-mifflin/worker/toby','dunder-mifflin/worker/david');
UPDATE hcm.person SET search_text='' WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/person/jim','dunder-mifflin/person/michael','dunder-mifflin/person/toby','dunder-mifflin/person/david');
DELETE FROM hcm.worker_event_type WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/%';
DELETE FROM hcm.employment_end_reason WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/%';
DELETE FROM hcm.worker_type WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/%';
