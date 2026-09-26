-- Field-level encryption (ADR-HCM-FIELD-ENCRYPTION): one wrapped data key per tenant and key
-- version. The key-encryption key never reaches the database; only its reference is stored so a
-- mismatched key is detected instead of producing unreadable values. Keys are never updated or
-- deleted by the runtime; rotation adds a version and a later job retires older ones.
CREATE TABLE hcm.tenant_field_key (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  key_version integer NOT NULL CHECK (key_version > 0),
  wrapped_key bytea NOT NULL CHECK (octet_length(wrapped_key) BETWEEN 40 AND 512),
  kek_reference text NOT NULL CHECK (length(kek_reference) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY (tenant_id,key_version)
);
ALTER TABLE hcm.tenant_field_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.tenant_field_key FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.tenant_field_key TO hcm_runtime,hcm_migrator
  USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
GRANT SELECT, INSERT ON hcm.tenant_field_key TO hcm_runtime;
