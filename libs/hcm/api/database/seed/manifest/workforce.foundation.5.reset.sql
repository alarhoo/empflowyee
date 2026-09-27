-- Ownership: workforce-foundation. Remove the event types this version added.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.worker_event_type WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/event-type/probation-extended','dunder-mifflin/event-type/probation-failed');
