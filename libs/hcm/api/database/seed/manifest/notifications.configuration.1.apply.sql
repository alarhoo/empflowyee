-- Safe configuration defaults only: this seed never manufactures messages or delivery/audit history.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.notification_template(tenant_id,event_type,title,body) VALUES
 ('local-dunder-mifflin','document.requested','Document requested','Please respond to document request {requestId}. Due date: {dueDate}.'),
 ('local-dunder-mifflin','document.submitted','Document submitted','A document was submitted for request {requestId}.'),
 ('local-dunder-mifflin','document.replacement-requested','Replacement requested','Please replace the document for request {requestId}. Due date: {dueDate}.')
ON CONFLICT DO NOTHING;
INSERT INTO hcm.notification_rule(tenant_id,event_type,enabled)
SELECT tenant_id,event_type,true FROM hcm.notification_template WHERE tenant_id='local-dunder-mifflin'
ON CONFLICT DO NOTHING;
