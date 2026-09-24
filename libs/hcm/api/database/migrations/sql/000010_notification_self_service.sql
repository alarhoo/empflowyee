-- Ownership: notifications. Persist account-scoped inbox evidence and explicit category preferences.
CREATE TABLE hcm.notification_preference (
 tenant_id text NOT NULL REFERENCES hcm.tenant(id),
 account_id text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('document.requested','document.submitted','document.replacement-requested')),
 enabled boolean NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,account_id,event_type),
 FOREIGN KEY(tenant_id,account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.notification_intent (
 tenant_id text NOT NULL REFERENCES hcm.tenant(id),
 id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
 event_id text NOT NULL CHECK(length(event_id) BETWEEN 1 AND 200),
 event_type text NOT NULL CHECK(event_type IN ('document.requested','document.submitted','document.replacement-requested')),
 source_request_id text NOT NULL CHECK(length(source_request_id) BETWEEN 1 AND 200),
 recipient_account_id text,
 recipient_key text NOT NULL CHECK(length(recipient_key) BETWEEN 1 AND 220),
 outcome text NOT NULL CHECK(outcome IN ('Delivered','Suppressed','Undeliverable')),
 reason_code text NOT NULL CHECK(length(reason_code) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,event_id,recipient_key),
 UNIQUE(tenant_id,id,recipient_account_id),
 FOREIGN KEY(tenant_id,recipient_account_id) REFERENCES hcm.user_account(tenant_id,id),
 CHECK(outcome='Undeliverable' OR recipient_account_id IS NOT NULL)
);
CREATE TABLE hcm.notification (
 tenant_id text NOT NULL,
 id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
 intent_id text NOT NULL,
 recipient_account_id text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('document.requested','document.submitted','document.replacement-requested')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 1000),
 source_request_id text NOT NULL CHECK(length(source_request_id) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,intent_id),
 FOREIGN KEY(tenant_id,intent_id,recipient_account_id) REFERENCES hcm.notification_intent(tenant_id,id,recipient_account_id),
 FOREIGN KEY(tenant_id,recipient_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.notification_command_receipt (
 tenant_id text NOT NULL,
 actor_account_id text NOT NULL,
 operation text NOT NULL CHECK(length(operation) BETWEEN 1 AND 100),
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 response jsonb NOT NULL CHECK(jsonb_typeof(response)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,actor_account_id,operation,idempotency_key),
 FOREIGN KEY(tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX notification_inbox ON hcm.notification(tenant_id,recipient_account_id,created_at,id);
CREATE INDEX notification_unread ON hcm.notification(tenant_id,recipient_account_id,created_at,id) WHERE read_at IS NULL;
-- Tenant isolation is mandatory on every table; own-account authorization is independently enforced by API queries.
DO $policies$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['notification_preference','notification_intent','notification','notification_command_receipt'] LOOP
  EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
  EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
 END LOOP;
END
$policies$;
-- Event evidence and inbox bodies remain immutable; no deletion is part of self-service.
GRANT UPDATE(enabled,revision,updated_at) ON hcm.notification_preference TO hcm_runtime;
GRANT UPDATE(read_at,revision) ON hcm.notification TO hcm_runtime;
