SHOW COLUMNS FROM goals;
SELECT c.id, c.project_id, c.birth_date, c.gender, c.avg_monthly_income
FROM clients c ORDER BY c.id DESC LIMIT 5;

SELECT g.id, g.client_id, g.goal_type_id, g.target_amount, g.initial_capital, g.monthly_contribution, g.term_months
FROM goals g ORDER BY g.id DESC LIMIT 15;

SELECT COUNT(*) AS yield_lines FROM passive_income_yield_lines;
