-- Ownership: employee. Dunder Mifflin narrows the product baseline only where it differs: work
-- arrangements stay between the employee, their manager and HR. No personal data is seeded.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,standard_field_code,requiredness_context,requiredness,visibility,self_edit_mode,allow_worker_visibility_preference,effective_from_at) VALUES
 ('local-dunder-mifflin','dunder-mifflin/profile-policy/work-mode','work-mode','WorkforceActivation','Optional','Manager','NotEditable',false,'2026-01-01T00:00:00Z');
