-- Ownership: employee. One published Employee Import template, so HR can import new hires
-- without first authoring a mapping. It holds a column mapping only; no personal data is seeded.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.employee_import_template (tenant_id,id,code,version_number,name,description,file_format,has_header_row,date_format,time_zone,created_by_account_id,updated_by_account_id) VALUES
 ('local-dunder-mifflin','dunder-mifflin/import-template/new-hires-1','NEW_HIRES',1,'New hires','Creates workers with their primary assignment from a CSV file.','Csv',true,'yyyy-MM-dd','America/New_York','dunder-mifflin/account/toby','dunder-mifflin/account/toby');
INSERT INTO hcm.employee_import_template_column (tenant_id,id,template_id,source_column_name,source_column_ordinal,standard_field_code,transformation_code,is_match_key,sort_order,created_by_account_id) VALUES
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/given-name','dunder-mifflin/import-template/new-hires-1','First name',1,'legal-given-name','trim',false,0,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/family-name','dunder-mifflin/import-template/new-hires-1','Last name',2,'legal-family-name','trim',false,1,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/worker-number','dunder-mifflin/import-template/new-hires-1','Worker number',3,'worker-number','uppercase',true,2,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/work-email','dunder-mifflin/import-template/new-hires-1','Work email',4,'work-email','lowercase',false,3,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/legal-entity','dunder-mifflin/import-template/new-hires-1','Legal entity',5,'legal-entity','trim',false,4,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/hire-date','dunder-mifflin/import-template/new-hires-1','Hire date',6,'hire-date','trim',false,5,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/unit','dunder-mifflin/import-template/new-hires-1','Unit',7,'organisation-unit','trim',false,6,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/department','dunder-mifflin/import-template/new-hires-1','Department',8,'department','trim',false,7,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/designation','dunder-mifflin/import-template/new-hires-1','Designation',9,'designation','trim',false,8,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/location','dunder-mifflin/import-template/new-hires-1','Location',10,'location','trim',false,9,'dunder-mifflin/account/toby'),
 ('local-dunder-mifflin','dunder-mifflin/import-column/new-hires-1/manager','dunder-mifflin/import-template/new-hires-1','Manager',11,'manager','uppercase',false,10,'dunder-mifflin/account/toby');
UPDATE hcm.employee_import_template SET status='Published',published_at='2026-01-01T00:00:00Z'
 WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/import-template/new-hires-1';
