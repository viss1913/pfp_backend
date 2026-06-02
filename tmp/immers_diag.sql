SELECT 'portfolios_pension' AS q, COUNT(*) AS cnt FROM portfolios WHERE is_active=1 AND (classes LIKE '%1%' OR JSON_CONTAINS(classes, '1'));
SELECT id, name, is_default, agent_id, classes, term_from_months, term_to_months, amount_from, amount_to FROM portfolios WHERE is_active=1 LIMIT 15;
SELECT 'macro_data_rows' AS q, COUNT(*) AS cnt FROM macro_data;
SELECT i.slug, d.value, d.date FROM macro_indicators i LEFT JOIN macro_data d ON d.indicator_id=i.id AND d.date=(SELECT MAX(date) FROM macro_data WHERE indicator_id=i.id) WHERE i.is_active=1 LIMIT 12;
SELECT id, project_id, `key`, value FROM system_settings WHERE `key`='report_finam' OR project_id=2;
SELECT id, name, product_type, is_default FROM products WHERE product_type='PDS' OR name LIKE '%ПДС%';
