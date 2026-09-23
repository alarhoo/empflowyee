-- Ownership: database foundation. No business data or domain tables.
GRANT USAGE ON SCHEMA hcm TO hcm_runtime;

CREATE FUNCTION hcm.current_tenant_id() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $tenant$
  SELECT nullif(current_setting('hcm.tenant_id', true), '')
$tenant$;

REVOKE ALL ON FUNCTION hcm.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hcm.current_tenant_id() TO hcm_runtime;

-- Future domain migrations grant only the specific operations their runtime needs.
ALTER DEFAULT PRIVILEGES FOR ROLE hcm_migrator IN SCHEMA hcm
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
