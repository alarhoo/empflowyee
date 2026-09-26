-- Ownership: workforce-foundation. HCM-2 Dunder Mifflin workforce: tenant lookups, the four version-1
-- people established, fictional workers without accounts, and primary solid reporting lines.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.worker_type(tenant_id,id,code,name,description,statutory_class,is_payroll_eligible,is_benefit_eligible,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/worker-type/employee','EMPLOYEE','Employee','Salaried employee on the payroll','Employee',true,true,1),
 ('local-dunder-mifflin','dunder-mifflin/worker-type/contractor','CONTRACTOR','Contractor','Engaged through a service contract','Contractor',false,false,2),
 ('local-dunder-mifflin','dunder-mifflin/worker-type/intern','INTERN','Intern','Time-limited internship','Intern',true,false,3);
INSERT INTO hcm.employment_end_reason(tenant_id,id,code,name,is_voluntary,is_eligible_for_rehire_by_default,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/end-reason/resignation','RESIGNATION','Resignation',true,true,1),
 ('local-dunder-mifflin','dunder-mifflin/end-reason/better-opportunity','BETTER_OPPORTUNITY','Better opportunity',true,true,2),
 ('local-dunder-mifflin','dunder-mifflin/end-reason/retirement','RETIREMENT','Retirement',true,true,3),
 ('local-dunder-mifflin','dunder-mifflin/end-reason/end-of-contract','END_OF_CONTRACT','End of contract',false,true,4),
 ('local-dunder-mifflin','dunder-mifflin/end-reason/redundancy','REDUNDANCY','Redundancy',false,true,5),
 ('local-dunder-mifflin','dunder-mifflin/end-reason/performance','PERFORMANCE','Performance',false,false,6),
 ('local-dunder-mifflin','dunder-mifflin/end-reason/misconduct','MISCONDUCT','Misconduct',false,false,7);
INSERT INTO hcm.worker_event_type(tenant_id,id,code,name,category,requires_approval,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/event-type/hired','HIRED','Hired','Hire',false,1),
 ('local-dunder-mifflin','dunder-mifflin/event-type/confirmed','CONFIRMED','Confirmed','Confirm',false,2),
 ('local-dunder-mifflin','dunder-mifflin/event-type/promoted','PROMOTED','Promoted','Promote',true,3),
 ('local-dunder-mifflin','dunder-mifflin/event-type/transferred','TRANSFERRED','Transferred','Transfer',true,4),
 ('local-dunder-mifflin','dunder-mifflin/event-type/demoted','DEMOTED','Demoted','Demote',true,5),
 ('local-dunder-mifflin','dunder-mifflin/event-type/resigned','RESIGNED','Resigned','Exit',true,6),
 ('local-dunder-mifflin','dunder-mifflin/event-type/terminated','TERMINATED','Terminated','Exit',true,7),
 ('local-dunder-mifflin','dunder-mifflin/event-type/rehired','REHIRED','Rehired','Rehire',false,8),
 ('local-dunder-mifflin','dunder-mifflin/event-type/corrected','CORRECTED','Record corrected','Other',true,9);
-- Establish the four version-1 records; their identities and legacy columns are unchanged.
UPDATE hcm.person SET search_text='jim halpert' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/person/jim';
UPDATE hcm.worker SET worker_type_id='dunder-mifflin/worker-type/employee',first_engagement_start_date='2001-10-01',is_currently_engaged=true WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/worker/jim';
UPDATE hcm.employment SET legal_entity_id='dunder-mifflin/legal-entity/dmpc',employment_type='Permanent',employment_status='Active',hire_date='2001-10-01',employment_sequence=1,is_primary_employment=true,work_email='jim.halpert@dundermifflin.example',continuous_service_start_date='2001-10-01',probation_end_date='2002-04-01',probation_status='Confirmed',confirmed_on='2002-04-01',notice_period_days=30 WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/employment/jim';
UPDATE hcm.assignment SET department_id='dunder-mifflin/department/sales',designation_id='dunder-mifflin/designation/sales-representative',work_mode='OnSite',full_time_equivalent=1.00,standard_hours_per_week=40.00,is_primary_assignment=true,effective_from='2005-01-01' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/jim';
UPDATE hcm.person SET search_text='michael scott' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/person/michael';
UPDATE hcm.worker SET worker_type_id='dunder-mifflin/worker-type/employee',first_engagement_start_date='1993-08-16',is_currently_engaged=true WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/worker/michael';
UPDATE hcm.employment SET legal_entity_id='dunder-mifflin/legal-entity/dmpc',employment_type='Permanent',employment_status='Active',hire_date='1993-08-16',employment_sequence=1,is_primary_employment=true,work_email='michael.scott@dundermifflin.example',continuous_service_start_date='1993-08-16',probation_end_date='1994-02-16',probation_status='Confirmed',confirmed_on='1994-02-16',notice_period_days=30 WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/employment/michael';
UPDATE hcm.assignment SET department_id='dunder-mifflin/department/management',designation_id='dunder-mifflin/designation/regional-manager',work_mode='OnSite',full_time_equivalent=1.00,standard_hours_per_week=40.00,is_primary_assignment=true,effective_from='2005-01-01' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/michael';
UPDATE hcm.person SET search_text='toby flenderson' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/person/toby';
UPDATE hcm.worker SET worker_type_id='dunder-mifflin/worker-type/employee',first_engagement_start_date='1996-11-04',is_currently_engaged=true WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/worker/toby';
UPDATE hcm.employment SET legal_entity_id='dunder-mifflin/legal-entity/dmpc',employment_type='Permanent',employment_status='Active',hire_date='1996-11-04',employment_sequence=1,is_primary_employment=true,work_email='toby.flenderson@dundermifflin.example',continuous_service_start_date='1996-11-04',probation_end_date='1997-05-04',probation_status='Confirmed',confirmed_on='1997-05-04',notice_period_days=30 WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/employment/toby';
UPDATE hcm.assignment SET department_id='dunder-mifflin/department/human-resources',designation_id='dunder-mifflin/designation/hr-representative',work_mode='OnSite',full_time_equivalent=1.00,standard_hours_per_week=40.00,is_primary_assignment=true,effective_from='2005-01-01' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/toby';
UPDATE hcm.person SET search_text='david wallace' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/person/david';
UPDATE hcm.worker SET worker_type_id='dunder-mifflin/worker-type/employee',first_engagement_start_date='1996-05-06',is_currently_engaged=true WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/worker/david';
UPDATE hcm.employment SET legal_entity_id='dunder-mifflin/legal-entity/dmpc',employment_type='Permanent',employment_status='Active',hire_date='1996-05-06',employment_sequence=1,is_primary_employment=true,work_email='david.wallace@dundermifflin.example',continuous_service_start_date='1996-05-06',probation_end_date='1996-11-06',probation_status='Confirmed',confirmed_on='1996-11-06',notice_period_days=30 WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/employment/david';
UPDATE hcm.assignment SET department_id='dunder-mifflin/department/management',designation_id='dunder-mifflin/designation/cfo',work_mode='OnSite',full_time_equivalent=1.00,standard_hours_per_week=40.00,is_primary_assignment=true,effective_from='2005-01-01' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/david';
-- Fictional workers without accounts give directory, org chart and team scope meaningful data.
INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name,search_text) VALUES
 ('local-dunder-mifflin','dunder-mifflin/person/dwight','Dwight','Schrute','Dwight Schrute','dwight schrute'),
 ('local-dunder-mifflin','dunder-mifflin/person/pam','Pam','Beesly','Pam Beesly','pam beesly'),
 ('local-dunder-mifflin','dunder-mifflin/person/angela','Angela','Martin','Angela Martin','angela martin'),
 ('local-dunder-mifflin','dunder-mifflin/person/oscar','Oscar','Martinez','Oscar Martinez','oscar martinez');
INSERT INTO hcm.worker(tenant_id,id,person_id,worker_code,worker_type_id,first_engagement_start_date,is_currently_engaged) VALUES
 ('local-dunder-mifflin','dunder-mifflin/worker/dwight','dunder-mifflin/person/dwight','DM-DWIGHT','dunder-mifflin/worker-type/employee','1999-04-01',true),
 ('local-dunder-mifflin','dunder-mifflin/worker/pam','dunder-mifflin/person/pam','DM-PAM','dunder-mifflin/worker-type/employee','2002-07-15',true),
 ('local-dunder-mifflin','dunder-mifflin/worker/angela','dunder-mifflin/person/angela','DM-ANGELA','dunder-mifflin/worker-type/employee','1999-09-13',true),
 ('local-dunder-mifflin','dunder-mifflin/worker/oscar','dunder-mifflin/person/oscar','DM-OSCAR','dunder-mifflin/worker-type/employee','2000-01-10',true);
INSERT INTO hcm.employment(tenant_id,id,worker_id,organisation_id,legal_entity_id,employment_type,employment_status,hire_date,employment_sequence,is_primary_employment,work_email,continuous_service_start_date,probation_end_date,probation_status,confirmed_on,notice_period_days) VALUES
 ('local-dunder-mifflin','dunder-mifflin/employment/dwight','dunder-mifflin/worker/dwight','dunder-mifflin/organisation/company','dunder-mifflin/legal-entity/dmpc','Permanent','Active','1999-04-01',1,true,'dwight.schrute@dundermifflin.example','1999-04-01','1999-10-01','Confirmed','1999-10-01',30),
 ('local-dunder-mifflin','dunder-mifflin/employment/pam','dunder-mifflin/worker/pam','dunder-mifflin/organisation/company','dunder-mifflin/legal-entity/dmpc','Permanent','Active','2002-07-15',1,true,'pam.beesly@dundermifflin.example','2002-07-15','2003-01-15','Confirmed','2003-01-15',30),
 ('local-dunder-mifflin','dunder-mifflin/employment/angela','dunder-mifflin/worker/angela','dunder-mifflin/organisation/company','dunder-mifflin/legal-entity/dmpc','Permanent','Active','1999-09-13',1,true,'angela.martin@dundermifflin.example','1999-09-13','2000-03-13','Confirmed','2000-03-13',30),
 ('local-dunder-mifflin','dunder-mifflin/employment/oscar','dunder-mifflin/worker/oscar','dunder-mifflin/organisation/company','dunder-mifflin/legal-entity/dmpc','Permanent','Active','2000-01-10',1,true,'oscar.martinez@dundermifflin.example','2000-01-10','2000-07-10','Confirmed','2000-07-10',30);
INSERT INTO hcm.assignment(tenant_id,id,employment_id,organisation_id,location_id,job_title,department_id,designation_id,work_mode,full_time_equivalent,standard_hours_per_week,is_primary_assignment,effective_from) VALUES
 ('local-dunder-mifflin','dunder-mifflin/assignment/dwight','dunder-mifflin/employment/dwight','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Assistant to the Regional Manager','dunder-mifflin/department/sales','dunder-mifflin/designation/assistant-regional-manager','OnSite',1.0,40.0,true,'2005-01-01'),
 ('local-dunder-mifflin','dunder-mifflin/assignment/pam','dunder-mifflin/employment/pam','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Receptionist','dunder-mifflin/department/reception','dunder-mifflin/designation/receptionist','OnSite',1.0,40.0,true,'2005-01-01'),
 ('local-dunder-mifflin','dunder-mifflin/assignment/angela','dunder-mifflin/employment/angela','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Senior Accountant','dunder-mifflin/department/accounting','dunder-mifflin/designation/senior-accountant','OnSite',1.0,40.0,true,'2005-01-01'),
 ('local-dunder-mifflin','dunder-mifflin/assignment/oscar','dunder-mifflin/employment/oscar','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Accountant','dunder-mifflin/department/accounting','dunder-mifflin/designation/accountant','OnSite',1.0,40.0,true,'2005-01-01');
INSERT INTO hcm.reporting_line(tenant_id,id,assignment_id,manager_assignment_id,reporting_line_type,is_primary,effective_from) VALUES
 ('local-dunder-mifflin','dunder-mifflin/reporting-line/jim','dunder-mifflin/assignment/jim','dunder-mifflin/assignment/michael','Solid',true,'2005-01-01'),
 ('local-dunder-mifflin','dunder-mifflin/reporting-line/dwight','dunder-mifflin/assignment/dwight','dunder-mifflin/assignment/michael','Solid',true,'2005-01-01'),
 ('local-dunder-mifflin','dunder-mifflin/reporting-line/pam','dunder-mifflin/assignment/pam','dunder-mifflin/assignment/michael','Solid',true,'2005-01-01'),
 ('local-dunder-mifflin','dunder-mifflin/reporting-line/michael','dunder-mifflin/assignment/michael','dunder-mifflin/assignment/david','Solid',true,'2005-01-01'),
 ('local-dunder-mifflin','dunder-mifflin/reporting-line/toby','dunder-mifflin/assignment/toby','dunder-mifflin/assignment/david','Solid',true,'2005-01-01');
