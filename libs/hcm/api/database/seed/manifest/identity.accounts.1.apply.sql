-- Ownership: identity-access. Approved fictional Dunder Mifflin development seed v1.
PERFORM set_config('hcm.tenant_id', 'local-dunder-mifflin', true);
INSERT INTO hcm.user_account (tenant_id,id,person_id,email) VALUES ('local-dunder-mifflin','dunder-mifflin/account/jim','dunder-mifflin/person/jim','jim.halpert@dundermifflin.example');
INSERT INTO hcm.development_persona (tenant_id,persona_key,account_id,role_label,sort_order,is_default) VALUES ('local-dunder-mifflin','jim','dunder-mifflin/account/jim','Employee','0','true');
INSERT INTO hcm.user_account (tenant_id,id,person_id,email) VALUES ('local-dunder-mifflin','dunder-mifflin/account/michael','dunder-mifflin/person/michael','michael.scott@dundermifflin.example');
INSERT INTO hcm.development_persona (tenant_id,persona_key,account_id,role_label,sort_order,is_default) VALUES ('local-dunder-mifflin','michael','dunder-mifflin/account/michael','Manager','1','false');
INSERT INTO hcm.user_account (tenant_id,id,person_id,email) VALUES ('local-dunder-mifflin','dunder-mifflin/account/toby','dunder-mifflin/person/toby','toby.flenderson@dundermifflin.example');
INSERT INTO hcm.development_persona (tenant_id,persona_key,account_id,role_label,sort_order,is_default) VALUES ('local-dunder-mifflin','toby','dunder-mifflin/account/toby','HR Operations','2','false');
INSERT INTO hcm.user_account (tenant_id,id,person_id,email) VALUES ('local-dunder-mifflin','dunder-mifflin/account/david','dunder-mifflin/person/david','david.wallace@dundermifflin.example');
INSERT INTO hcm.development_persona (tenant_id,persona_key,account_id,role_label,sort_order,is_default) VALUES ('local-dunder-mifflin','david','dunder-mifflin/account/david','Tenant Administrator','3','false');
