-- Ownership: employee. The probation part of the employee operations seed (DEC-HCM2-003): a
-- fictional new hire in probation with one Final review due 14 days before the probation end date,
-- owned by Toby and assigned to Michael. No assessment, decision or notification history is seeded.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name,search_text) VALUES
 ('local-dunder-mifflin','dunder-mifflin/person/andy','Andy','Bernard','Andy Bernard','andy howard');
INSERT INTO hcm.worker(tenant_id,id,person_id,worker_code,worker_type_id,first_engagement_start_date,is_currently_engaged) VALUES
 ('local-dunder-mifflin','dunder-mifflin/worker/andy','dunder-mifflin/person/andy','DM-ANDY','dunder-mifflin/worker-type/employee','2026-07-01',true);
INSERT INTO hcm.employment(tenant_id,id,worker_id,organisation_id,legal_entity_id,employment_type,employment_status,hire_date,employment_sequence,is_primary_employment,work_email,continuous_service_start_date,probation_end_date,probation_status,confirmed_on,notice_period_days) VALUES
 ('local-dunder-mifflin','dunder-mifflin/employment/andy','dunder-mifflin/worker/andy','dunder-mifflin/organisation/company','dunder-mifflin/legal-entity/dmpc','Permanent','Active','2026-07-01',1,true,'andy.howard@dundermifflin.example','2026-07-01','2026-12-31','InProgress',NULL,30);
INSERT INTO hcm.assignment(tenant_id,id,employment_id,organisation_id,location_id,job_title,department_id,designation_id,work_mode,full_time_equivalent,standard_hours_per_week,is_primary_assignment,effective_from) VALUES
 ('local-dunder-mifflin','dunder-mifflin/assignment/andy','dunder-mifflin/employment/andy','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Sales Representative','dunder-mifflin/department/sales','dunder-mifflin/designation/sales-representative','OnSite',1.0,40.0,true,'2026-07-01');
INSERT INTO hcm.reporting_line(tenant_id,id,assignment_id,manager_assignment_id,reporting_line_type,is_primary,effective_from) VALUES
 ('local-dunder-mifflin','dunder-mifflin/reporting-line/andy','dunder-mifflin/assignment/andy','dunder-mifflin/assignment/michael','Solid',true,'2026-07-01');
INSERT INTO hcm.probation_review(tenant_id,id,employment_id,sequence_number,review_type,period_start,period_end,probation_end_date,due_date,primary_reviewer_account_id,owner_account_id,schedule_reason,created_by_account_id) VALUES
 ('local-dunder-mifflin','dunder-mifflin/probation-review/andy-final','dunder-mifflin/employment/andy',1,'Final','2026-07-01','2026-12-31','2026-12-31','2026-12-17','dunder-mifflin/account/michael','dunder-mifflin/account/toby','Scheduled when the employment entered probation.','dunder-mifflin/account/toby');
