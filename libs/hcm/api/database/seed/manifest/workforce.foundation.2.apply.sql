-- Ownership: workforce-foundation. Fictional Dunder Mifflin organisation structure for HCM-2 local development.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
UPDATE hcm.location SET code='NYC-01',location_type='HeadOffice',address_line1='1 Madison Avenue',state_or_province='NY',postal_code='10010' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/location/new-york';
UPDATE hcm.location SET code='SCR-01',location_type='BranchOffice',address_line1='1725 Slough Avenue',state_or_province='PA',postal_code='18505' WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/location/scranton';
INSERT INTO hcm.organisation_profile(tenant_id,default_time_zone,default_language,default_currency_code,financial_year_start_month,financial_year_start_day,headquarters_location_id) VALUES('local-dunder-mifflin','America/New_York','en-US','USD',1,1,'dunder-mifflin/location/new-york');
INSERT INTO hcm.legal_entity(tenant_id,id,code,name,registered_name,entity_type,country_code,registration_number,registered_location_id,reporting_currency_code,incorporated_on,operations_started_on) VALUES('local-dunder-mifflin','dunder-mifflin/legal-entity/dmpc','DMPC','Dunder Mifflin','Dunder Mifflin Paper Company, Inc.','PublicLimited','US','DM-1949-0001','dunder-mifflin/location/new-york','USD','1949-01-01','1949-01-01');
INSERT INTO hcm.organisation_unit_type(tenant_id,id,code,name,plural_name,parent_type_id,hierarchy_level,allow_multiple_per_parent,is_legal_entity_bearing,sort_order) VALUES('local-dunder-mifflin','dunder-mifflin/unit-type/company','COMPANY','Company','Companies',NULL,1,false,true,1);
INSERT INTO hcm.organisation_unit_type(tenant_id,id,code,name,plural_name,parent_type_id,hierarchy_level,allow_multiple_per_parent,is_legal_entity_bearing,sort_order) VALUES('local-dunder-mifflin','dunder-mifflin/unit-type/branch','BRANCH','Branch','Branches','dunder-mifflin/unit-type/company',2,true,false,2);
INSERT INTO hcm.organisation_version(tenant_id,id,organisation_id,unit_type_id,parent_organisation_id,name,legal_entity_id,primary_location_id,cost_center_code,effective_from) VALUES('local-dunder-mifflin','dunder-mifflin/organisation-version/company-1','dunder-mifflin/organisation/company','dunder-mifflin/unit-type/company',NULL,'Dunder Mifflin','dunder-mifflin/legal-entity/dmpc','dunder-mifflin/location/new-york','CC-100','2005-01-01');
INSERT INTO hcm.organisation_version(tenant_id,id,organisation_id,unit_type_id,parent_organisation_id,name,primary_location_id,cost_center_code,effective_from) VALUES('local-dunder-mifflin','dunder-mifflin/organisation-version/new-york-1','dunder-mifflin/organisation/new-york','dunder-mifflin/unit-type/branch','dunder-mifflin/organisation/company','New York Headquarters','dunder-mifflin/location/new-york','CC-110','2005-01-01');
INSERT INTO hcm.organisation_version(tenant_id,id,organisation_id,unit_type_id,parent_organisation_id,name,primary_location_id,cost_center_code,effective_from) VALUES('local-dunder-mifflin','dunder-mifflin/organisation-version/scranton-1','dunder-mifflin/organisation/scranton','dunder-mifflin/unit-type/branch','dunder-mifflin/organisation/company','Scranton Branch','dunder-mifflin/location/scranton','CC-120','2005-01-01');
INSERT INTO hcm.department(tenant_id,id,code,name,cost_center_code,target_headcount,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/department/management','MANAGEMENT','Management','CC-900',3,1),
 ('local-dunder-mifflin','dunder-mifflin/department/sales','SALES','Sales','CC-200',6,2),
 ('local-dunder-mifflin','dunder-mifflin/department/accounting','ACCOUNTING','Accounting','CC-300',3,3),
 ('local-dunder-mifflin','dunder-mifflin/department/human-resources','HUMAN_RESOURCES','Human Resources','CC-400',1,4),
 ('local-dunder-mifflin','dunder-mifflin/department/reception','RECEPTION','Reception','CC-500',1,5);
INSERT INTO hcm.designation(tenant_id,id,code,name,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/designation/cfo','CHIEF_FINANCIAL_OFFICER','Chief Financial Officer',1),
 ('local-dunder-mifflin','dunder-mifflin/designation/regional-manager','REGIONAL_MANAGER','Regional Manager',2),
 ('local-dunder-mifflin','dunder-mifflin/designation/assistant-regional-manager','ASSISTANT_TO_THE_REGIONAL_MANAGER','Assistant to the Regional Manager',3),
 ('local-dunder-mifflin','dunder-mifflin/designation/senior-accountant','SENIOR_ACCOUNTANT','Senior Accountant',4),
 ('local-dunder-mifflin','dunder-mifflin/designation/sales-representative','SALES_REPRESENTATIVE','Sales Representative',5),
 ('local-dunder-mifflin','dunder-mifflin/designation/accountant','ACCOUNTANT','Accountant',6),
 ('local-dunder-mifflin','dunder-mifflin/designation/hr-representative','HR_REPRESENTATIVE','HR Representative',7),
 ('local-dunder-mifflin','dunder-mifflin/designation/receptionist','RECEPTIONIST','Receptionist',8);
