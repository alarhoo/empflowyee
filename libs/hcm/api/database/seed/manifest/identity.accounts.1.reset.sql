-- Ownership: identity-access. Approved fictional Dunder Mifflin development seed v1.
PERFORM set_config('hcm.tenant_id', 'local-dunder-mifflin', true);
DELETE FROM hcm.development_persona WHERE tenant_id='local-dunder-mifflin' AND persona_key IN ('jim','michael','toby','david');
DELETE FROM hcm.user_account WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/account/jim','dunder-mifflin/account/michael','dunder-mifflin/account/toby','dunder-mifflin/account/david');
