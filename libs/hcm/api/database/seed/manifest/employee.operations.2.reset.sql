-- Ownership: employee. Remove the seeded hire with every probation record and fact made for it.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.probation_decision WHERE tenant_id='local-dunder-mifflin' AND employment_id='dunder-mifflin/employment/andy';
UPDATE hcm.probation_assessment SET superseded_by_assessment_id=NULL WHERE tenant_id='local-dunder-mifflin' AND review_id IN (SELECT id FROM hcm.probation_review WHERE tenant_id='local-dunder-mifflin' AND employment_id='dunder-mifflin/employment/andy');
DELETE FROM hcm.probation_assessment WHERE tenant_id='local-dunder-mifflin' AND review_id IN (SELECT id FROM hcm.probation_review WHERE tenant_id='local-dunder-mifflin' AND employment_id='dunder-mifflin/employment/andy');
DELETE FROM hcm.probation_review WHERE tenant_id='local-dunder-mifflin' AND employment_id='dunder-mifflin/employment/andy';
DELETE FROM hcm.worker_event WHERE tenant_id='local-dunder-mifflin' AND worker_id='dunder-mifflin/worker/andy';
DELETE FROM hcm.reporting_line WHERE tenant_id='local-dunder-mifflin' AND assignment_id='dunder-mifflin/assignment/andy';
DELETE FROM hcm.assignment WHERE tenant_id='local-dunder-mifflin' AND employment_id='dunder-mifflin/employment/andy';
DELETE FROM hcm.employment WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/employment/andy';
DELETE FROM hcm.worker WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/worker/andy';
DELETE FROM hcm.person WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/person/andy';
