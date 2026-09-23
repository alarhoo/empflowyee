-- Ownership: runtime. Approved fictional Dunder Mifflin development seed v1.
PERFORM set_config('hcm.tenant_id', 'local-dunder-mifflin', true);
INSERT INTO hcm.tenant (id,slug,display_name,status,defaults) VALUES ('local-dunder-mifflin','acme','Dunder Mifflin','active','{"theme":"horizon-light","language":"en","locale":"en-US","timezone":"America/New_York"}');
INSERT INTO hcm.tenant_hostname (hostname,tenant_id) VALUES ('acme.localhost','local-dunder-mifflin');
