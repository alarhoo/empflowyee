-- Ownership: employee (documents for the attachment purpose). HR service teams, memberships,
-- request types, versioned service level policies, requests, messages, attachments, assignee
-- history and service level targets (TDD-HCM-2-DATA-MODEL migration order 12, HR Service Desk and
-- My HR Requests TDD#DATA). DEC-HCM2-004: a 24x7 clock, first response and resolution targets per
-- priority, a pause while waiting for the employee, and a 7-day reopen window. Internal messages
-- and attachments are deny-by-default for employees; membership routes work but never authorizes.

-- Service attachments are purpose-limited document blobs: PDF, PNG or JPEG of at most 10 MiB,
-- never listed or downloaded through documents routes.
ALTER TABLE hcm.document_blob DROP CONSTRAINT document_blob_purpose_check;
ALTER TABLE hcm.document_blob
  ADD CONSTRAINT document_blob_purpose CHECK (purpose IN ('document','import-source','service-attachment'));
ALTER TABLE hcm.document_blob DROP CONSTRAINT document_blob_media_type;
ALTER TABLE hcm.document_blob
  ADD CONSTRAINT document_blob_media_type CHECK (
    (purpose IN ('document','service-attachment') AND media_type IN ('application/pdf','image/png','image/jpeg'))
    OR (purpose = 'import-source' AND media_type IN ('text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        AND byte_length <= 5242880));

CREATE TABLE hcm.hr_service_team (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by_account_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.hr_service_team_membership (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  team_id text NOT NULL,
  account_id text NOT NULL,
  member_role text NOT NULL DEFAULT 'Agent' CHECK (member_role IN ('Agent','Lead')),
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by_account_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,team_id,account_id),
  FOREIGN KEY (tenant_id,team_id) REFERENCES hcm.hr_service_team(tenant_id,id),
  FOREIGN KEY (tenant_id,account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.hr_service_level_policy (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9-]{1,39}$'),
  version_number integer NOT NULL CHECK (version_number > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Published','Retired')),
  -- Minutes per priority: {"P1":{"firstResponse":240,"resolution":1440},...}.
  targets jsonb NOT NULL,
  pause_while_waiting boolean NOT NULL DEFAULT true,
  reopen_window_days integer NOT NULL DEFAULT 7 CHECK (reopen_window_days BETWEEN 0 AND 90),
  published_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by_account_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code,version_number),
  CONSTRAINT hr_service_level_policy_published CHECK ((status = 'Draft') = (published_at IS NULL)),
  CONSTRAINT hr_service_level_policy_targets CHECK (
    jsonb_typeof(targets) = 'object' AND targets ?& ARRAY['P1','P2','P3','P4']),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX hr_service_level_policy_one_published ON hcm.hr_service_level_policy (tenant_id,code) WHERE status = 'Published';
CREATE UNIQUE INDEX hr_service_level_policy_one_draft ON hcm.hr_service_level_policy (tenant_id,code) WHERE status = 'Draft';

-- A published or retired policy version is immutable apart from retiring it.
CREATE FUNCTION hcm.require_draft_service_level_policy() RETURNS trigger LANGUAGE plpgsql AS $policy$
BEGIN
  IF OLD.status <> 'Draft' AND (NEW.targets IS DISTINCT FROM OLD.targets OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.pause_while_waiting IS DISTINCT FROM OLD.pause_while_waiting OR NEW.reopen_window_days IS DISTINCT FROM OLD.reopen_window_days
      OR NEW.status = 'Draft') THEN
    RAISE EXCEPTION 'Published service level policies are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$policy$;
CREATE TRIGGER hr_service_level_policy_immutable BEFORE UPDATE ON hcm.hr_service_level_policy
  FOR EACH ROW EXECUTE FUNCTION hcm.require_draft_service_level_policy();

CREATE TABLE hcm.hr_service_request_type (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9-]{1,59}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  category text NOT NULL CHECK (category IN ('PersonalData','Employment','Pay','Leave','Documents','General')),
  -- Who may raise it: every worker through My HR Requests, or HR only.
  audience text NOT NULL CHECK (audience IN ('Employee','HrOnly')),
  classification text NOT NULL DEFAULT 'Standard' CHECK (classification IN ('Standard','Sensitive')),
  default_team_id text NOT NULL,
  service_level_code text NOT NULL,
  default_priority text NOT NULL DEFAULT 'P3' CHECK (default_priority IN ('P1','P2','P3','P4')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 999),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by_account_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,default_team_id) REFERENCES hcm.hr_service_team(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

-- Per-tenant request numbers, formatted HR-000123.
CREATE TABLE hcm.hr_service_request_sequence (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id) PRIMARY KEY,
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);

CREATE TABLE hcm.hr_service_request (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  request_number text NOT NULL CHECK (request_number ~ '^HR-[0-9]{6,}$'),
  requester_worker_id text NOT NULL,
  requester_account_id text,
  created_by_account_id text NOT NULL,
  type_id text NOT NULL,
  service_level_policy_id text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('P1','P2','P3','P4')),
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New','Open','WaitingForEmployee','WaitingForHr','Resolved','Closed','Cancelled')),
  team_id text NOT NULL,
  assignee_account_id text,
  resolution_code text CHECK (resolution_code IN ('Answered','Corrected','NoActionNeeded','Duplicate','OutOfScope')),
  resolution_summary text CHECK (length(btrim(resolution_summary)) BETWEEN 1 AND 1000),
  resolved_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text CHECK (length(btrim(cancel_reason)) BETWEEN 1 AND 500),
  first_responded_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,request_number),
  CONSTRAINT hr_service_request_resolved CHECK ((status IN ('Resolved','Closed')) = (resolution_code IS NOT NULL AND resolved_at IS NOT NULL)),
  CONSTRAINT hr_service_request_closed CHECK ((status = 'Closed') = (closed_at IS NOT NULL)),
  CONSTRAINT hr_service_request_cancelled CHECK ((status = 'Cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)),
  FOREIGN KEY (tenant_id,requester_worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,requester_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,type_id) REFERENCES hcm.hr_service_request_type(tenant_id,id),
  FOREIGN KEY (tenant_id,service_level_policy_id) REFERENCES hcm.hr_service_level_policy(tenant_id,id),
  FOREIGN KEY (tenant_id,team_id) REFERENCES hcm.hr_service_team(tenant_id,id),
  FOREIGN KEY (tenant_id,assignee_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX hr_service_request_requester ON hcm.hr_service_request (tenant_id,requester_worker_id,created_at DESC,id);
CREATE INDEX hr_service_request_team ON hcm.hr_service_request (tenant_id,team_id,status);

CREATE TABLE hcm.hr_service_request_message (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  request_id text NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  visibility text NOT NULL CHECK (visibility IN ('EmployeeVisible','Internal')),
  kind text NOT NULL CHECK (kind IN ('Message','StatusUpdate')),
  author_account_id text NOT NULL,
  from_requester boolean NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  supersedes_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,request_id,sequence_number),
  -- The requester never writes internal content.
  CONSTRAINT hr_service_message_requester_visible CHECK (NOT from_requester OR visibility = 'EmployeeVisible'),
  FOREIGN KEY (tenant_id,request_id) REFERENCES hcm.hr_service_request(tenant_id,id),
  FOREIGN KEY (tenant_id,author_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,supersedes_message_id) REFERENCES hcm.hr_service_request_message(tenant_id,id)
);

CREATE TABLE hcm.hr_service_request_attachment (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  request_id text NOT NULL,
  message_id text NOT NULL,
  blob_id uuid NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('EmployeeVisible','Internal')),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,blob_id),
  FOREIGN KEY (tenant_id,request_id) REFERENCES hcm.hr_service_request(tenant_id,id),
  FOREIGN KEY (tenant_id,message_id) REFERENCES hcm.hr_service_request_message(tenant_id,id),
  FOREIGN KEY (tenant_id,blob_id) REFERENCES hcm.document_blob(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

-- An attachment carries its message's visibility and reads only a service-attachment blob.
CREATE FUNCTION hcm.require_service_attachment() RETURNS trigger LANGUAGE plpgsql AS $attachment$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hcm.document_blob WHERE tenant_id=NEW.tenant_id AND id=NEW.blob_id AND purpose='service-attachment') THEN
    RAISE EXCEPTION 'A service attachment reads only a service-attachment file' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hcm.hr_service_request_message WHERE tenant_id=NEW.tenant_id AND id=NEW.message_id
      AND request_id=NEW.request_id AND visibility=NEW.visibility) THEN
    RAISE EXCEPTION 'An attachment keeps its message visibility' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$attachment$;
CREATE TRIGGER hr_service_request_attachment_source BEFORE INSERT ON hcm.hr_service_request_attachment
  FOR EACH ROW EXECUTE FUNCTION hcm.require_service_attachment();

CREATE TABLE hcm.hr_service_request_assignee (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  request_id text NOT NULL,
  team_id text NOT NULL,
  assignee_account_id text,
  assigned_by_account_id text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,request_id) REFERENCES hcm.hr_service_request(tenant_id,id),
  FOREIGN KEY (tenant_id,team_id) REFERENCES hcm.hr_service_team(tenant_id,id),
  FOREIGN KEY (tenant_id,assignee_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,assigned_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX hr_service_request_assignee_current ON hcm.hr_service_request_assignee (tenant_id,request_id) WHERE ended_at IS NULL;

CREATE TABLE hcm.hr_service_level_target (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  request_id text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('FirstResponse','Resolution')),
  target_minutes integer NOT NULL CHECK (target_minutes > 0),
  started_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  paused_at timestamptz,
  paused_minutes integer NOT NULL DEFAULT 0 CHECK (paused_minutes >= 0),
  met_at timestamptz,
  breached_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,request_id,target_kind),
  CONSTRAINT hr_service_level_target_due CHECK (due_at > started_at),
  FOREIGN KEY (tenant_id,request_id) REFERENCES hcm.hr_service_request(tenant_id,id)
);

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['hr_service_team','hr_service_team_membership','hr_service_level_policy','hr_service_request_type',
      'hr_service_request_sequence','hr_service_request','hr_service_request_message','hr_service_request_attachment',
      'hr_service_request_assignee','hr_service_level_target'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT, INSERT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;

-- Messages and attachments are append-only; assignee history only ends; the rest changes by column.
GRANT UPDATE (name,description,is_active,revision,updated_by_account_id,updated_at) ON hcm.hr_service_team TO hcm_runtime;
GRANT UPDATE (member_role,is_active,revision,updated_by_account_id,updated_at) ON hcm.hr_service_team_membership TO hcm_runtime;
GRANT UPDATE (name,status,targets,pause_while_waiting,reopen_window_days,published_at,revision,updated_by_account_id,updated_at) ON hcm.hr_service_level_policy TO hcm_runtime;
GRANT UPDATE (name,description,category,audience,classification,default_team_id,service_level_code,default_priority,is_active,sort_order,revision,updated_by_account_id,updated_at) ON hcm.hr_service_request_type TO hcm_runtime;
GRANT UPDATE (last_value) ON hcm.hr_service_request_sequence TO hcm_runtime;
GRANT UPDATE (priority,status,team_id,assignee_account_id,resolution_code,resolution_summary,resolved_at,closed_at,cancelled_at,cancel_reason,first_responded_at,revision,updated_at) ON hcm.hr_service_request TO hcm_runtime;
GRANT UPDATE (ended_at) ON hcm.hr_service_request_assignee TO hcm_runtime;
GRANT UPDATE (due_at,paused_at,paused_minutes,met_at,breached_at,revision) ON hcm.hr_service_level_target TO hcm_runtime;
