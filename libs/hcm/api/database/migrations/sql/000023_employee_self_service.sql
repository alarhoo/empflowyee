-- Ownership: employee. My Profile self-service writes.
-- 000019 withheld blood group from runtime updates; My Profile lets workers maintain it directly.
GRANT UPDATE (blood_group) ON hcm.person TO hcm_runtime;
-- Custom field values: a change closes the current dated value and inserts its successor; a
-- second change on the same day updates that day's value in place. Codes and owners never change.
GRANT INSERT ON hcm.custom_field_value TO hcm_runtime;
GRANT UPDATE (text_value,integer_value,decimal_value,date_value,boolean_value,effective_to,superseded_by_id,revision,updated_at,updated_by_account_id) ON hcm.custom_field_value TO hcm_runtime;
-- Selected options are child rows of one value; a same-day change replaces them, so runtime may
-- delete them. This is the only runtime DELETE on employee tables.
GRANT INSERT, DELETE ON hcm.custom_field_value_option TO hcm_runtime;
