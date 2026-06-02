INSERT INTO system_settings (`key`, value, value_type, description, category, project_id)
SELECT 'report_finam', '2', 'number', 'Finam Report v2', 'report', 2
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE `key`='report_finam' AND project_id=2);

UPDATE system_settings SET value='2' WHERE `key`='report_finam' AND project_id=2;

SELECT id, `key`, value, project_id FROM system_settings WHERE `key`='report_finam';
