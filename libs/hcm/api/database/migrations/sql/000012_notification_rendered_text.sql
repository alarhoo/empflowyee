-- Template limits apply before literal placeholder substitution. An opaque request ID may expand text,
-- and a missing due date may render empty text. Keep a finite worst-case bound without truncating evidence.
ALTER TABLE hcm.notification DROP CONSTRAINT notification_title_check;
ALTER TABLE hcm.notification DROP CONSTRAINT notification_body_check;
ALTER TABLE hcm.notification ADD CONSTRAINT notification_title_check CHECK(length(title)<=24000);
ALTER TABLE hcm.notification ADD CONSTRAINT notification_body_check CHECK(length(body)<=200000);
