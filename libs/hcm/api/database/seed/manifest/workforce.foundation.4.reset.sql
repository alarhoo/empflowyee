-- Ownership: workforce-foundation. Remove the event types this version added.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
DELETE FROM hcm.worker_event_type WHERE tenant_id='local-dunder-mifflin' AND id IN ('dunder-mifflin/event-type/location-changed','dunder-mifflin/event-type/manager-changed','dunder-mifflin/event-type/hours-changed','dunder-mifflin/event-type/employment-type-changed','dunder-mifflin/event-type/suspended','dunder-mifflin/event-type/returned-to-work');
