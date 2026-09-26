-- Ownership: workforce-foundation. Remove only the structure rows added by this version.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.designation WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/designation/%';
DELETE FROM hcm.department WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/department/%';
DELETE FROM hcm.organisation_version WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/organisation-version/%';
DELETE FROM hcm.organisation_unit_type WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/unit-type/branch';
DELETE FROM hcm.organisation_unit_type WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/unit-type/company';
DELETE FROM hcm.organisation_profile WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.legal_entity WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/legal-entity/dmpc';
UPDATE hcm.location SET code=NULL,location_type=NULL,address_line1='',state_or_province='',postal_code='' WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/location/new-york','dunder-mifflin/location/scranton');
