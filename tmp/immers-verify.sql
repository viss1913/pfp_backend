SELECT id, value, project_id FROM system_settings WHERE `key`='report_finam';
SELECT COUNT(*) AS pension_defaults FROM portfolios WHERE is_default=1 AND classes LIKE '%[1]%';
