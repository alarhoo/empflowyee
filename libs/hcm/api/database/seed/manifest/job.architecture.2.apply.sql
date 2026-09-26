-- Ownership: job-architecture. The position part planned for job.architecture@1, delivered as a
-- forward module because applied modules are immutable: Scranton positions on the published
-- example profiles, sized so the existing assignments fit capacity, with the assignments linked.
-- Versions are inserted as drafts and published the way approved change requests apply them.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.position(tenant_id,id,code,name,lifecycle_status) VALUES
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-SALES-REP','SCR-SALES-REP','Sales Representative, Scranton','Open'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-ASST-RM','SCR-ASST-RM','Assistant to the Regional Manager, Scranton','Open'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-REGIONAL-MGR','SCR-REGIONAL-MGR','Regional Manager, Scranton','Open'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-HR-REP','SCR-HR-REP','Human Resources Representative, Scranton','Open'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-ACCOUNTANT','SCR-ACCOUNTANT','Accountant, Scranton','Open'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-SENIOR-ACCT','SCR-SENIOR-ACCT','Senior Accountant, Scranton','Open');
INSERT INTO hcm.position_version(tenant_id,id,position_id,version_number,job_profile_version_id,job_grade_id,designation_id,legal_entity_id,organisation_id,department_id,location_id,position_type,headcount_capacity,fte_capacity,is_key_position,effective_from,change_summary) VALUES
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-SALES-REP/v1','dunder-mifflin/position/SCR-SALES-REP',1,'dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','dunder-mifflin/job-grade/v1/G3','dunder-mifflin/designation/sales-representative','dunder-mifflin/legal-entity/dmpc','dunder-mifflin/organisation/scranton','dunder-mifflin/department/sales','dunder-mifflin/location/scranton','Regular',2,2.00,false,'2005-01-01','Initial position.'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-ASST-RM/v1','dunder-mifflin/position/SCR-ASST-RM',1,'dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','dunder-mifflin/job-grade/v1/G4','dunder-mifflin/designation/assistant-regional-manager','dunder-mifflin/legal-entity/dmpc','dunder-mifflin/organisation/scranton','dunder-mifflin/department/sales','dunder-mifflin/location/scranton','Regular',1,1.00,false,'2005-01-01','Initial position.'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-REGIONAL-MGR/v1','dunder-mifflin/position/SCR-REGIONAL-MGR',1,'dunder-mifflin/job-profile/REGIONAL_MANAGER/v1','dunder-mifflin/job-grade/v1/G6','dunder-mifflin/designation/regional-manager','dunder-mifflin/legal-entity/dmpc','dunder-mifflin/organisation/scranton','dunder-mifflin/department/management','dunder-mifflin/location/scranton','Regular',1,1.00,true,'2005-01-01','Initial position.'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-HR-REP/v1','dunder-mifflin/position/SCR-HR-REP',1,'dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1','dunder-mifflin/job-grade/v1/G3','dunder-mifflin/designation/hr-representative','dunder-mifflin/legal-entity/dmpc','dunder-mifflin/organisation/scranton','dunder-mifflin/department/human-resources','dunder-mifflin/location/scranton','Regular',1,1.00,false,'2005-01-01','Initial position.'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-ACCOUNTANT/v1','dunder-mifflin/position/SCR-ACCOUNTANT',1,'dunder-mifflin/job-profile/ACCOUNTANT/v1','dunder-mifflin/job-grade/v1/G3','dunder-mifflin/designation/accountant','dunder-mifflin/legal-entity/dmpc','dunder-mifflin/organisation/scranton','dunder-mifflin/department/accounting','dunder-mifflin/location/scranton','Regular',2,2.00,false,'2005-01-01','Initial position.'),
 ('local-dunder-mifflin','dunder-mifflin/position/SCR-SENIOR-ACCT/v1','dunder-mifflin/position/SCR-SENIOR-ACCT',1,'dunder-mifflin/job-profile/ACCOUNTANT/v1','dunder-mifflin/job-grade/v1/G4','dunder-mifflin/designation/senior-accountant','dunder-mifflin/legal-entity/dmpc','dunder-mifflin/organisation/scranton','dunder-mifflin/department/accounting','dunder-mifflin/location/scranton','Regular',1,1.00,false,'2005-01-01','Initial position.');
UPDATE hcm.position_version SET status='InReview' WHERE tenant_id='local-dunder-mifflin' AND position_id LIKE 'dunder-mifflin/position/%';
UPDATE hcm.position_version SET status='Published',published_at='2026-01-01T00:00:00Z',source_digest=encode(sha256(convert_to(id,'UTF8')),'hex') WHERE tenant_id='local-dunder-mifflin' AND position_id LIKE 'dunder-mifflin/position/%';
UPDATE hcm.position p SET current_published_version_id=p.id || '/v1' WHERE p.tenant_id='local-dunder-mifflin' AND p.id LIKE 'dunder-mifflin/position/%';
INSERT INTO hcm.position_relationship(tenant_id,id,source_position_id,target_position_id,relationship_type,effective_from) VALUES
 ('local-dunder-mifflin','dunder-mifflin/position-relationship/SCR-SALES-REP','dunder-mifflin/position/SCR-SALES-REP','dunder-mifflin/position/SCR-REGIONAL-MGR','SolidLine','2005-01-01'),
 ('local-dunder-mifflin','dunder-mifflin/position-relationship/SCR-ASST-RM','dunder-mifflin/position/SCR-ASST-RM','dunder-mifflin/position/SCR-REGIONAL-MGR','SolidLine','2005-01-01'),
 ('local-dunder-mifflin','dunder-mifflin/position-relationship/SCR-ACCOUNTANT','dunder-mifflin/position/SCR-ACCOUNTANT','dunder-mifflin/position/SCR-SENIOR-ACCT','SolidLine','2005-01-01');
UPDATE hcm.assignment SET position_id='dunder-mifflin/position/SCR-SALES-REP' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/jim';
UPDATE hcm.assignment SET position_id='dunder-mifflin/position/SCR-ASST-RM' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/dwight';
UPDATE hcm.assignment SET position_id='dunder-mifflin/position/SCR-REGIONAL-MGR' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/michael';
UPDATE hcm.assignment SET position_id='dunder-mifflin/position/SCR-HR-REP' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/toby';
UPDATE hcm.assignment SET position_id='dunder-mifflin/position/SCR-ACCOUNTANT' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/oscar';
UPDATE hcm.assignment SET position_id='dunder-mifflin/position/SCR-SENIOR-ACCT' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/assignment/angela';
