-- Ownership: job-architecture. The catalogue part of job.architecture@1: one published Dunder
-- Mifflin catalogue with families, tracks, levels, bands and grades, and published example job
-- profiles. Versions are inserted as drafts and then published, as the commands do. Positions
-- arrive with the positions foundation as a forward module. No compensation values are seeded.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.job_catalogue(tenant_id,id,code,name,description) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-catalogue','DUNDER_MIFFLIN','Dunder Mifflin job catalogue','Job families, career tracks, levels, bands and grades of Dunder Mifflin.');
INSERT INTO hcm.job_catalogue_version(tenant_id,id,job_catalogue_id,version_number,change_summary) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-catalogue',1,'Initial job architecture.');
INSERT INTO hcm.job_family(tenant_id,id,job_catalogue_version_id,parent_job_family_id,code,name,depth,materialized_path,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-family/v1/SALES','dunder-mifflin/job-catalogue/v1',NULL,'SALES','Sales',1,'SALES',10),
 ('local-dunder-mifflin','dunder-mifflin/job-family/v1/CORPORATE_SERVICES','dunder-mifflin/job-catalogue/v1',NULL,'CORPORATE_SERVICES','Corporate Services',1,'CORPORATE_SERVICES',20);
INSERT INTO hcm.job_family(tenant_id,id,job_catalogue_version_id,parent_job_family_id,code,name,depth,materialized_path,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-family/v1/INSIDE_SALES','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-family/v1/SALES','INSIDE_SALES','Inside Sales',2,'SALES/INSIDE_SALES',10),
 ('local-dunder-mifflin','dunder-mifflin/job-family/v1/ACCOUNT_MANAGEMENT','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-family/v1/SALES','ACCOUNT_MANAGEMENT','Account Management',2,'SALES/ACCOUNT_MANAGEMENT',20),
 ('local-dunder-mifflin','dunder-mifflin/job-family/v1/HUMAN_RESOURCES','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-family/v1/CORPORATE_SERVICES','HUMAN_RESOURCES','Human Resources',2,'CORPORATE_SERVICES/HUMAN_RESOURCES',10),
 ('local-dunder-mifflin','dunder-mifflin/job-family/v1/FINANCE','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-family/v1/CORPORATE_SERVICES','FINANCE','Finance',2,'CORPORATE_SERVICES/FINANCE',20);
INSERT INTO hcm.career_track(tenant_id,id,job_catalogue_version_id,code,name,kind,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/career-track/v1/IC','dunder-mifflin/job-catalogue/v1','IC','Individual Contributor','IndividualContributor',10),
 ('local-dunder-mifflin','dunder-mifflin/career-track/v1/MGMT','dunder-mifflin/job-catalogue/v1','MGMT','Management','Management',20);
INSERT INTO hcm.job_level(tenant_id,id,job_catalogue_version_id,career_track_id,code,name,sequence_number,scope_summary) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-level/v1/IC1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/career-track/v1/IC','IC1','Associate',1,'Learns the role and completes defined tasks with guidance.'),
 ('local-dunder-mifflin','dunder-mifflin/job-level/v1/IC2','dunder-mifflin/job-catalogue/v1','dunder-mifflin/career-track/v1/IC','IC2','Professional',2,'Owns a defined area of work independently.'),
 ('local-dunder-mifflin','dunder-mifflin/job-level/v1/IC3','dunder-mifflin/job-catalogue/v1','dunder-mifflin/career-track/v1/IC','IC3','Senior Professional',3,'Handles complex work and guides colleagues.'),
 ('local-dunder-mifflin','dunder-mifflin/job-level/v1/IC4','dunder-mifflin/job-catalogue/v1','dunder-mifflin/career-track/v1/IC','IC4','Principal',4,'Sets direction for a discipline across branches.'),
 ('local-dunder-mifflin','dunder-mifflin/job-level/v1/M1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/career-track/v1/MGMT','M1','Team Lead',1,'Leads a small team within a branch function.'),
 ('local-dunder-mifflin','dunder-mifflin/job-level/v1/M2','dunder-mifflin/job-catalogue/v1','dunder-mifflin/career-track/v1/MGMT','M2','Manager',2,'Manages a branch or function and its people.'),
 ('local-dunder-mifflin','dunder-mifflin/job-level/v1/M3','dunder-mifflin/job-catalogue/v1','dunder-mifflin/career-track/v1/MGMT','M3','Executive',3,'Leads several branches or a corporate function.');
INSERT INTO hcm.job_band(tenant_id,id,job_catalogue_version_id,code,name,sequence_number) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-band/v1/ENTRY','dunder-mifflin/job-catalogue/v1','ENTRY','Entry',1),
 ('local-dunder-mifflin','dunder-mifflin/job-band/v1/PROFESSIONAL','dunder-mifflin/job-catalogue/v1','PROFESSIONAL','Professional',2),
 ('local-dunder-mifflin','dunder-mifflin/job-band/v1/SENIOR','dunder-mifflin/job-catalogue/v1','SENIOR','Senior',3),
 ('local-dunder-mifflin','dunder-mifflin/job-band/v1/LEADERSHIP','dunder-mifflin/job-catalogue/v1','LEADERSHIP','Leadership',4);
INSERT INTO hcm.job_grade(tenant_id,id,job_catalogue_version_id,job_band_id,code,name,sequence_number) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-grade/v1/G1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-band/v1/ENTRY','G1','Grade 1',1),
 ('local-dunder-mifflin','dunder-mifflin/job-grade/v1/G2','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-band/v1/ENTRY','G2','Grade 2',2),
 ('local-dunder-mifflin','dunder-mifflin/job-grade/v1/G3','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-band/v1/PROFESSIONAL','G3','Grade 3',1),
 ('local-dunder-mifflin','dunder-mifflin/job-grade/v1/G4','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-band/v1/PROFESSIONAL','G4','Grade 4',2),
 ('local-dunder-mifflin','dunder-mifflin/job-grade/v1/G5','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-band/v1/SENIOR','G5','Grade 5',1),
 ('local-dunder-mifflin','dunder-mifflin/job-grade/v1/G6','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-band/v1/SENIOR','G6','Grade 6',2),
 ('local-dunder-mifflin','dunder-mifflin/job-grade/v1/G7','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-band/v1/LEADERSHIP','G7','Grade 7',1),
 ('local-dunder-mifflin','dunder-mifflin/job-grade/v1/G8','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-band/v1/LEADERSHIP','G8','Grade 8',2);
UPDATE hcm.job_catalogue_version SET status='InReview' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/job-catalogue/v1';
UPDATE hcm.job_catalogue_version SET status='Published',effective_from='2000-01-01',published_at='2026-01-01T00:00:00Z',
  source_digest=encode(sha256(convert_to('dunder-mifflin/job-catalogue/v1','UTF8')),'hex')
  WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/job-catalogue/v1';
UPDATE hcm.job_catalogue SET current_published_version_id='dunder-mifflin/job-catalogue/v1'
  WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/job-catalogue';

INSERT INTO hcm.job_profile(tenant_id,id,code,name) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-profile/SALES_REPRESENTATIVE','SALES_REPRESENTATIVE','Sales Representative'),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/REGIONAL_MANAGER','REGIONAL_MANAGER','Regional Manager'),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/HR_REPRESENTATIVE','HR_REPRESENTATIVE','Human Resources Representative'),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/ACCOUNTANT','ACCOUNTANT','Accountant');
INSERT INTO hcm.job_profile_version(tenant_id,id,job_profile_id,job_catalogue_version_id,job_family_id,career_track_id,job_level_id,version_number,summary,purpose,scope_of_impact,autonomy_level) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','dunder-mifflin/job-profile/SALES_REPRESENTATIVE','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-family/v1/INSIDE_SALES','dunder-mifflin/career-track/v1/IC','dunder-mifflin/job-level/v1/IC2',1,
  'Sells paper products to business accounts.','Grow revenue from assigned business accounts through consultative selling.','A book of regional business accounts.','Works independently within branch sales targets.'),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1','dunder-mifflin/job-profile/REGIONAL_MANAGER','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-family/v1/ACCOUNT_MANAGEMENT','dunder-mifflin/career-track/v1/MGMT','dunder-mifflin/job-level/v1/M2',1,
  'Leads a branch and its sales and support staff.','Run branch operations and develop the branch team.','One branch, its staff and its accounts.','Sets branch priorities within corporate direction.'),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1','dunder-mifflin/job-profile/HR_REPRESENTATIVE','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-family/v1/HUMAN_RESOURCES','dunder-mifflin/career-track/v1/IC','dunder-mifflin/job-level/v1/IC2',1,
  'Supports employees and managers on HR matters.','Administer HR policy and support employee relations at the branch.','All employees of a branch.','Works independently and escalates policy exceptions.'),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/ACCOUNTANT/v1','dunder-mifflin/job-profile/ACCOUNTANT','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-family/v1/FINANCE','dunder-mifflin/career-track/v1/IC','dunder-mifflin/job-level/v1/IC2',1,
  'Keeps the branch accounts.','Record, reconcile and report branch financial activity.','Branch ledgers and reporting.','Works independently within accounting policy.');
INSERT INTO hcm.job_profile_responsibility(tenant_id,id,job_profile_version_id,responsibility_code,statement,is_essential,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1/r/TARGETS','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','TARGETS','Meet quarterly sales targets for assigned accounts.',true,10),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1/r/RELATIONSHIPS','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','RELATIONSHIPS','Build and maintain long-term client relationships.',true,20),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1/r/OPERATIONS','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1','OPERATIONS','Run daily branch operations and meet branch targets.',true,10),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1/r/PEOPLE','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1','PEOPLE','Hire, coach and review branch staff.',true,20),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1/r/POLICY','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1','POLICY','Apply HR policy consistently across the branch.',true,10),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1/r/RELATIONS','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1','RELATIONS','Handle employee relations cases confidentially.',true,20),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/ACCOUNTANT/v1/r/LEDGER','dunder-mifflin/job-profile/ACCOUNTANT/v1','LEDGER','Maintain accurate branch ledgers.',true,10),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/ACCOUNTANT/v1/r/REPORTING','dunder-mifflin/job-profile/ACCOUNTANT/v1','REPORTING','Prepare monthly financial reports.',true,20);
INSERT INTO hcm.job_profile_requirement(tenant_id,id,job_profile_version_id,requirement_code,requirement_type,name,proficiency_level,minimum_quantity,quantity_unit,is_mandatory,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1/q/EXPERIENCE','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','EXPERIENCE','Experience','Business-to-business sales','',1,'Years',true,10),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1/q/NEGOTIATION','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','NEGOTIATION','Skill','Negotiation','Intermediate',NULL,NULL,false,20),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1/q/EXPERIENCE','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1','EXPERIENCE','Experience','People management','',3,'Years',true,10),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1/q/EDUCATION','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1','EDUCATION','Education','Degree in human resources or a related field','',NULL,NULL,true,10),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/ACCOUNTANT/v1/q/EDUCATION','dunder-mifflin/job-profile/ACCOUNTANT/v1','EDUCATION','Education','Degree in accounting','',NULL,NULL,true,10),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/ACCOUNTANT/v1/q/EXPERIENCE','dunder-mifflin/job-profile/ACCOUNTANT/v1','EXPERIENCE','Experience','Bookkeeping','',2,'Years',false,20);
INSERT INTO hcm.job_profile_grade(tenant_id,id,job_profile_version_id,job_catalogue_version_id,job_grade_id,is_default) VALUES
 ('local-dunder-mifflin','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1/g/G3','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-grade/v1/G3',true),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1/g/G4','dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-grade/v1/G4',false),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1/g/G6','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-grade/v1/G6',true),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1/g/G7','dunder-mifflin/job-profile/REGIONAL_MANAGER/v1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-grade/v1/G7',false),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1/g/G3','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-grade/v1/G3',true),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1/g/G4','dunder-mifflin/job-profile/HR_REPRESENTATIVE/v1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-grade/v1/G4',false),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/ACCOUNTANT/v1/g/G3','dunder-mifflin/job-profile/ACCOUNTANT/v1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-grade/v1/G3',true),
 ('local-dunder-mifflin','dunder-mifflin/job-profile/ACCOUNTANT/v1/g/G4','dunder-mifflin/job-profile/ACCOUNTANT/v1','dunder-mifflin/job-catalogue/v1','dunder-mifflin/job-grade/v1/G4',false);
UPDATE hcm.job_profile_version SET status='InReview' WHERE tenant_id='local-dunder-mifflin' AND job_profile_id LIKE 'dunder-mifflin/job-profile/%';
UPDATE hcm.job_profile_version SET status='Published',effective_from='2000-01-01',published_at='2026-01-01T00:00:00Z',
  source_digest=encode(sha256(convert_to(id,'UTF8')),'hex')
  WHERE tenant_id='local-dunder-mifflin' AND job_profile_id LIKE 'dunder-mifflin/job-profile/%';
UPDATE hcm.job_profile p SET current_published_version_id=p.id || '/v1'
  WHERE p.tenant_id='local-dunder-mifflin' AND p.id LIKE 'dunder-mifflin/job-profile/%';
