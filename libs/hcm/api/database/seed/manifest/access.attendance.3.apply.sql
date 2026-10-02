-- Ownership: Access Control. Grant dated calendar assignment independently of
-- publication and give the canonical administrator navigation discovery.
PERFORM set_config('hcm.tenant_id','local-dunder-mifflin',true);
INSERT INTO hcm.access_permission(tenant_id,code,description,kind)
VALUES ('local-dunder-mifflin','hcm.attendance.holiday-calendars.manage','Assign and supersede dated holiday calendars','business-operation');
INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES
('local-dunder-mifflin','tenant-administrator','hcm.attendance.holiday-calendars.manage'),
('local-dunder-mifflin','tenant-administrator','hcm.catalogue.HOLIDAY_CALENDARS.discover');
