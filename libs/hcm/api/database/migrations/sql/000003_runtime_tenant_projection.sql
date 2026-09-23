-- Ownership: runtime. Projections preserve Account ownership of tenant/commercial configuration.
CREATE TABLE hcm.tenant (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('trial','active','grace','suspended','deactivated')),
  allow_user_theme boolean NOT NULL DEFAULT true,
  defaults jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(defaults) = 'object'),
  logo_url text,
  primary_color text
);
ALTER TABLE hcm.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.tenant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.tenant TO hcm_runtime, hcm_migrator
  USING (id = hcm.current_tenant_id()) WITH CHECK (id = hcm.current_tenant_id());
GRANT SELECT ON hcm.tenant TO hcm_runtime;

-- Explicit global routing index: only an exact hostname and opaque tenant ID, no private tenant data.
CREATE TABLE hcm.tenant_hostname (
  hostname text PRIMARY KEY CHECK (hostname = lower(hostname)),
  tenant_id text NOT NULL REFERENCES hcm.tenant(id)
);
GRANT SELECT ON hcm.tenant_hostname TO hcm_runtime;
