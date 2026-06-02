SELECT
  JSON_EXTRACT(goals_summary, '$.summary.consolidated_portfolio.assets_allocation') AS assets_alloc,
  JSON_EXTRACT(goals_summary, '$.summary.consolidated_portfolio.cash_flow_allocation') AS cash_alloc
FROM clients WHERE id = 12;
