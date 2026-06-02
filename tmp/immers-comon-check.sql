SELECT COUNT(*) AS comon_rows FROM comon_recommended_strategies;
SELECT id, LEFT(settings, 200) AS settings_head FROM projects WHERE id IN (2, 14);
SELECT id, JSON_LENGTH(goals_summary) AS goals_len,
  JSON_SEARCH(goals_summary, 'one', 'STOCK', NULL, '$**.product_type') AS stock_path
FROM clients WHERE id = 12;
