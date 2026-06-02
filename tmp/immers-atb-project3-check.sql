SELECT id, name, public_key FROM projects WHERE id IN (2, 3, 28);
SELECT project_id, `key`, value FROM system_settings WHERE `key` = 'report_finam' AND project_id IN (2, 3, 28);
