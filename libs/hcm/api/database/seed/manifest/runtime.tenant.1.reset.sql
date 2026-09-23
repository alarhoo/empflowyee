-- Ownership: runtime. Approved fictional Dunder Mifflin development seed v1.
PERFORM set_config('hcm.tenant_id', 'local-dunder-mifflin', true);
DELETE FROM hcm.tenant_hostname WHERE tenant_id='local-dunder-mifflin' AND hostname='acme.localhost';
DELETE FROM hcm.tenant WHERE id='local-dunder-mifflin';
