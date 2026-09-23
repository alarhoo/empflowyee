-- Ownership: workforce-foundation. Approved fictional Dunder Mifflin development seed v1.
PERFORM set_config('hcm.tenant_id', 'local-dunder-mifflin', true);
DELETE FROM hcm.assignment WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/assignment/jim','dunder-mifflin/assignment/michael','dunder-mifflin/assignment/toby','dunder-mifflin/assignment/david');
DELETE FROM hcm.employment WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/employment/jim','dunder-mifflin/employment/michael','dunder-mifflin/employment/toby','dunder-mifflin/employment/david');
DELETE FROM hcm.worker WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/worker/jim','dunder-mifflin/worker/michael','dunder-mifflin/worker/toby','dunder-mifflin/worker/david');
DELETE FROM hcm.person WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/person/jim','dunder-mifflin/person/michael','dunder-mifflin/person/toby','dunder-mifflin/person/david');
DELETE FROM hcm.location WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/location/scranton','dunder-mifflin/location/new-york');
DELETE FROM hcm.organisation WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/organisation/scranton','dunder-mifflin/organisation/new-york');
DELETE FROM hcm.organisation WHERE tenant_id='local-dunder-mifflin' AND id='dunder-mifflin/organisation/company';
