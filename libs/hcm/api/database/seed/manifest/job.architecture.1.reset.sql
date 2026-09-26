-- Ownership: job-architecture. Remove the catalogue and example profiles this version added.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
UPDATE hcm.job_profile SET current_published_version_id=NULL WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/job-profile/%';
DELETE FROM hcm.job_profile_grade WHERE tenant_id='local-dunder-mifflin' AND job_profile_version_id LIKE 'dunder-mifflin/job-profile/%';
DELETE FROM hcm.job_profile_requirement WHERE tenant_id='local-dunder-mifflin' AND job_profile_version_id LIKE 'dunder-mifflin/job-profile/%';
DELETE FROM hcm.job_profile_responsibility WHERE tenant_id='local-dunder-mifflin' AND job_profile_version_id LIKE 'dunder-mifflin/job-profile/%';
DELETE FROM hcm.job_profile_version WHERE tenant_id='local-dunder-mifflin' AND job_profile_id LIKE 'dunder-mifflin/job-profile/%';
DELETE FROM hcm.job_profile WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/job-profile/%';
UPDATE hcm.job_catalogue SET current_published_version_id=NULL WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/job-catalogue';
DELETE FROM hcm.job_grade WHERE tenant_id='local-dunder-mifflin' AND job_catalogue_version_id='dunder-mifflin/job-catalogue/v1';
DELETE FROM hcm.job_band WHERE tenant_id='local-dunder-mifflin' AND job_catalogue_version_id='dunder-mifflin/job-catalogue/v1';
DELETE FROM hcm.job_level WHERE tenant_id='local-dunder-mifflin' AND job_catalogue_version_id='dunder-mifflin/job-catalogue/v1';
DELETE FROM hcm.career_track WHERE tenant_id='local-dunder-mifflin' AND job_catalogue_version_id='dunder-mifflin/job-catalogue/v1';
DELETE FROM hcm.job_family WHERE tenant_id='local-dunder-mifflin' AND job_catalogue_version_id='dunder-mifflin/job-catalogue/v1' AND depth=2;
DELETE FROM hcm.job_family WHERE tenant_id='local-dunder-mifflin' AND job_catalogue_version_id='dunder-mifflin/job-catalogue/v1';
DELETE FROM hcm.job_catalogue_version WHERE tenant_id='local-dunder-mifflin' AND job_catalogue_id='dunder-mifflin/job-catalogue';
DELETE FROM hcm.job_catalogue WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/job-catalogue';
