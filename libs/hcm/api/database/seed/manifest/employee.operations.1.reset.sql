-- Ownership: employee. Remove the seeded template with any runs made from it; migrator deletes bypass the draft-only column rule.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.employee_import_issue WHERE tenant_id='local-dunder-mifflin' AND run_id IN (SELECT id FROM hcm.employee_import_run WHERE tenant_id='local-dunder-mifflin' AND template_id='dunder-mifflin/import-template/new-hires-1');
DELETE FROM hcm.employee_import_row WHERE tenant_id='local-dunder-mifflin' AND run_id IN (SELECT id FROM hcm.employee_import_run WHERE tenant_id='local-dunder-mifflin' AND template_id='dunder-mifflin/import-template/new-hires-1');
DELETE FROM hcm.employee_import_run WHERE tenant_id='local-dunder-mifflin' AND template_id='dunder-mifflin/import-template/new-hires-1';
DELETE FROM hcm.employee_import_template_column WHERE tenant_id='local-dunder-mifflin' AND template_id='dunder-mifflin/import-template/new-hires-1';
DELETE FROM hcm.employee_import_template WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/import-template/new-hires-1';
