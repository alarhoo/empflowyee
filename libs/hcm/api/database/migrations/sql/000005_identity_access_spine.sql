-- Ownership: identity-access (accounts/personas), access-control (roles/discovery permissions).
CREATE TABLE hcm.user_account (
  tenant_id text NOT NULL, id text NOT NULL, person_id text NOT NULL,
  email text NOT NULL, enabled boolean NOT NULL DEFAULT true,
  preferences jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(preferences)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,person_id) REFERENCES hcm.person(tenant_id,id)
);
CREATE UNIQUE INDEX user_account_email ON hcm.user_account(tenant_id,lower(email));
CREATE TABLE hcm.access_role (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id), id text NOT NULL, label text NOT NULL,
  PRIMARY KEY (tenant_id,id)
);
CREATE TABLE hcm.access_permission (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id), code text NOT NULL,
  description text NOT NULL, kind text NOT NULL CHECK (kind='catalogue-discovery'),
  PRIMARY KEY (tenant_id,code)
);
CREATE TABLE hcm.role_permission (
  tenant_id text NOT NULL, role_id text NOT NULL, permission_code text NOT NULL,
  PRIMARY KEY (tenant_id,role_id,permission_code),
  FOREIGN KEY (tenant_id,role_id) REFERENCES hcm.access_role(tenant_id,id),
  FOREIGN KEY (tenant_id,permission_code) REFERENCES hcm.access_permission(tenant_id,code)
);
CREATE TABLE hcm.account_role (
  tenant_id text NOT NULL, account_id text NOT NULL, role_id text NOT NULL,
  PRIMARY KEY (tenant_id,account_id,role_id),
  FOREIGN KEY (tenant_id,account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,role_id) REFERENCES hcm.access_role(tenant_id,id)
);
-- Explicit global product catalogue; tenant grants remain Account-owned commercial projections.
CREATE TABLE hcm.entitlement_definition (code text PRIMARY KEY, domain text NOT NULL UNIQUE);
GRANT SELECT ON hcm.entitlement_definition TO hcm_runtime;
CREATE TABLE hcm.tenant_entitlement (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id), code text NOT NULL REFERENCES hcm.entitlement_definition(code),
  enabled boolean NOT NULL DEFAULT true, PRIMARY KEY (tenant_id,code)
);
CREATE TABLE hcm.tenant_feature_flag (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id), code text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id,code)
);
CREATE TABLE hcm.development_persona (
  tenant_id text NOT NULL, persona_key text NOT NULL, account_id text NOT NULL,
  role_label text NOT NULL, sort_order integer NOT NULL, is_default boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id,persona_key), UNIQUE (tenant_id,account_id),
  FOREIGN KEY (tenant_id,account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX development_persona_default ON hcm.development_persona(tenant_id) WHERE is_default;
DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['user_account','access_role','access_permission','role_permission','account_role','tenant_entitlement','tenant_feature_flag','development_persona'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;
