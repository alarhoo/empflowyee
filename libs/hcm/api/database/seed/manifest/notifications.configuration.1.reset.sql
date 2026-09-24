-- Only explicit local dataset reset invokes this removal; normal seeds preserve administrator edits.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.notification_rule WHERE tenant_id='local-dunder-mifflin';
DELETE FROM hcm.notification_template WHERE tenant_id='local-dunder-mifflin';
