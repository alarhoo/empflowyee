-- Ownership: access-control. Approved HCM-3 COMMON#AUTHORIZATION adds optional
-- typed grant scopes. No scope rows means the existing grant remains tenant-wide.
-- Alternatives within one dimension are OR; different dimensions intersect within
-- one grant. Existing grants, public contracts and workforce identities are preserved.
CREATE TABLE hcm.account_role_scope (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  grant_id text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN
    ('Tenant','LegalEntity','OrgUnit','Department','Location','Assignment','Employment')),
  legal_entity_id text,
  org_unit_id text,
  department_id text,
  location_id text,
  assignment_id text,
  employment_id text,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,grant_id) REFERENCES hcm.account_role(tenant_id,grant_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES hcm.legal_entity(tenant_id,id),
  FOREIGN KEY (tenant_id,org_unit_id) REFERENCES hcm.organisation(tenant_id,id),
  FOREIGN KEY (tenant_id,department_id) REFERENCES hcm.department(tenant_id,id),
  FOREIGN KEY (tenant_id,location_id) REFERENCES hcm.location(tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  CONSTRAINT account_role_scope_target CHECK (
    num_nonnulls(legal_entity_id,org_unit_id,department_id,location_id,assignment_id,employment_id)
      = CASE WHEN scope_kind = 'Tenant' THEN 0 ELSE 1 END
    AND (scope_kind = 'Tenant'
      OR (scope_kind = 'LegalEntity' AND legal_entity_id IS NOT NULL)
      OR (scope_kind = 'OrgUnit' AND org_unit_id IS NOT NULL)
      OR (scope_kind = 'Department' AND department_id IS NOT NULL)
      OR (scope_kind = 'Location' AND location_id IS NOT NULL)
      OR (scope_kind = 'Assignment' AND assignment_id IS NOT NULL)
      OR (scope_kind = 'Employment' AND employment_id IS NOT NULL)))
);
CREATE UNIQUE INDEX account_role_scope_target ON hcm.account_role_scope
  (tenant_id,grant_id,scope_kind,
   coalesce(legal_entity_id,org_unit_id,department_id,location_id,assignment_id,employment_id,tenant_id));
ALTER TABLE hcm.account_role_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.account_role_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.account_role_scope TO hcm_runtime,hcm_migrator
  USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
-- Scope replacement uses owner-authorized INSERT/DELETE in the shared revocation lock.
-- No UPDATE allows a target to be silently rebound underneath a reviewed grant.
GRANT SELECT,INSERT,DELETE ON hcm.account_role_scope TO hcm_runtime;

-- A scoped protected-admin grant would violate the existing last-administrator
-- guarantee. Keep those special grants tenant-wide; ordinary grants may be scoped.
CREATE FUNCTION hcm.guard_protected_grant_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,hcm AS $body$
BEGIN
  IF EXISTS (SELECT 1 FROM hcm.account_role g JOIN hcm.access_role r
      ON r.tenant_id=g.tenant_id AND r.id=g.role_id
      WHERE g.tenant_id=NEW.tenant_id AND g.grant_id=NEW.grant_id AND r.protected_admin) THEN
    RAISE EXCEPTION 'Protected administrator grant cannot be scoped' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
REVOKE ALL ON FUNCTION hcm.guard_protected_grant_scope() FROM PUBLIC;
CREATE TRIGGER account_role_scope_protected BEFORE INSERT ON hcm.account_role_scope
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_protected_grant_scope();
