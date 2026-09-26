-- Ownership: job-architecture. Remove the positions this version added and unlink assignments.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
UPDATE hcm.assignment SET position_id=NULL WHERE tenant_id='local-dunder-mifflin' AND position_id LIKE 'dunder-mifflin/position/%';
DELETE FROM hcm.position_relationship WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/position-relationship/%';
UPDATE hcm.position SET current_published_version_id=NULL WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/position/%';
DELETE FROM hcm.position_version WHERE tenant_id='local-dunder-mifflin' AND position_id LIKE 'dunder-mifflin/position/%';
DELETE FROM hcm.position WHERE tenant_id='local-dunder-mifflin' AND id LIKE 'dunder-mifflin/position/%';
