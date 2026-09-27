-- Ownership: workforce-foundation. Worker event types for probation decisions that
-- workforce.foundation@3 and @4 did not cover, delivered as a forward module because applied
-- modules are immutable. Confirm keeps CONFIRMED; No change records no event.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.worker_event_type(tenant_id,id,code,name,category,requires_approval,sort_order) VALUES
 ('local-dunder-mifflin','dunder-mifflin/event-type/probation-extended','PROBATION_EXTENDED','Probation extended','Other',false,16),
 ('local-dunder-mifflin','dunder-mifflin/event-type/probation-failed','PROBATION_FAILED','Probation failed','Other',false,17);
