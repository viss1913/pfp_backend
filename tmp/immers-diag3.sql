SELECT g.id, g.client_id, g.goal_type_id, g.name, g.target_amount, g.desired_monthly_income, g.initial_capital, g.monthly_replenishment, g.term_months
FROM goals g WHERE g.client_id IN (1,2) ORDER BY g.client_id, g.goal_type_id;

SELECT COUNT(*) AS yield_lines FROM passive_income_yield_lines;

SELECT id, project_id, amount_from, amount_to, term_from, term_to, yield_percent
FROM passive_income_yield_lines LIMIT 10;

SELECT id, client_id, created_at, report_version FROM client_reports ORDER BY id DESC LIMIT 5;
