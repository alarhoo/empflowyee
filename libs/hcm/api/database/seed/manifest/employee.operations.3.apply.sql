-- Ownership: employee. The HR service part of the employee operations seed (DEC-HCM2-004): one HR
-- Operations team led by Toby, service level policy standard@1 with the approved 24x7 targets, and
-- request types including personal-data correction. No service conversation is seeded.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.hr_service_team(tenant_id,id,code,name,description,created_by_account_id,updated_by_account_id) VALUES
 ('local-dunder-mifflin','dunder-mifflin/hr-team/operations','HR_OPERATIONS','HR Operations','Handles employee questions and record corrections.','dunder-mifflin/account/toby','dunder-mifflin/account/toby');
INSERT INTO hcm.hr_service_team_membership(tenant_id,id,team_id,account_id,member_role,created_by_account_id,updated_by_account_id) VALUES
 ('local-dunder-mifflin','dunder-mifflin/hr-team/operations/toby','dunder-mifflin/hr-team/operations','dunder-mifflin/account/toby','Lead','dunder-mifflin/account/toby','dunder-mifflin/account/toby');
INSERT INTO hcm.hr_service_level_policy(tenant_id,id,code,version_number,name,status,targets,pause_while_waiting,reopen_window_days,published_at,created_by_account_id,updated_by_account_id) VALUES
 ('local-dunder-mifflin','dunder-mifflin/hr-service-level/standard-1','standard',1,'Standard service levels','Published',
  jsonb_build_object('P1',jsonb_build_object('firstResponse',240,'resolution',1440),'P2',jsonb_build_object('firstResponse',1440,'resolution',4320),
    'P3',jsonb_build_object('firstResponse',2880,'resolution',7200),'P4',jsonb_build_object('firstResponse',4320,'resolution',14400)),
  true,7,'2026-01-01T00:00:00Z','dunder-mifflin/account/toby','dunder-mifflin/account/toby');
INSERT INTO hcm.hr_service_request_type(tenant_id,id,code,name,description,category,audience,classification,default_team_id,service_level_code,default_priority,sort_order,created_by_account_id,updated_by_account_id) VALUES
 ('local-dunder-mifflin','dunder-mifflin/hr-request-type/personal-data-correction','personal-data-correction','Personal data correction','Ask HR to correct a legal name, birth date or other personal fact on your record.','PersonalData','Employee','Standard','dunder-mifflin/hr-team/operations','standard','P3',10,'dunder-mifflin/account/toby','dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/hr-request-type/general-question','general-question','General question','Any other question for HR.','General','Employee','Standard','dunder-mifflin/hr-team/operations','standard','P4',20,'dunder-mifflin/account/toby','dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/hr-request-type/pay-question','pay-question','Pay question','Questions about pay or deductions.','Pay','Employee','Sensitive','dunder-mifflin/hr-team/operations','standard','P2',30,'dunder-mifflin/account/toby','dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/hr-request-type/employment-letter','employment-letter','Employment letter','Ask for a letter confirming your employment.','Documents','Employee','Standard','dunder-mifflin/hr-team/operations','standard','P3',40,'dunder-mifflin/account/toby','dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/hr-request-type/workplace-concern','workplace-concern','Workplace concern','Raised and handled by HR only.','Employment','HrOnly','Sensitive','dunder-mifflin/hr-team/operations','standard','P2',50,'dunder-mifflin/account/toby','dunder-mifflin/account/toby');
