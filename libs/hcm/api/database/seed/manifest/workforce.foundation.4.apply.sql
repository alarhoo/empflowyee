-- Ownership: workforce-foundation. Worker event types for the employment change types that
-- workforce.foundation@3 did not cover, delivered as a forward module because applied modules are
-- immutable. Each executed change records one event per employment (Employment Changes TDD#ACTION).
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.worker_event_type(tenant_id,id,code,name,category,requires_approval,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/event-type/location-changed','LOCATION_CHANGED','Location changed','Transfer',true,10),
 ('local-dunder-mifflin','dunder-mifflin/event-type/manager-changed','MANAGER_CHANGED','Manager changed','Transfer',true,11),
 ('local-dunder-mifflin','dunder-mifflin/event-type/hours-changed','HOURS_CHANGED','Working hours changed','Other',true,12),
 ('local-dunder-mifflin','dunder-mifflin/event-type/employment-type-changed','EMPLOYMENT_TYPE_CHANGED','Employment type changed','Other',true,13),
 ('local-dunder-mifflin','dunder-mifflin/event-type/suspended','SUSPENDED','Suspended','Suspend',true,14),
 ('local-dunder-mifflin','dunder-mifflin/event-type/returned-to-work','RETURNED_TO_WORK','Returned to work','Other',true,15);
