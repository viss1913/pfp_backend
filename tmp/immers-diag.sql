SELECT id, name, is_default, is_active, agent_id, classes, amount_from, amount_to, term_from_months, term_to_months
FROM portfolios WHERE is_default=1 OR classes LIKE '%1%'
ORDER BY id DESC LIMIT 15;

SELECT id, `key`, value, project_id FROM system_settings WHERE `key`='report_finam';

SELECT c.id, c.project_id, g.id AS goal_id, g.goal_type_id, g.name, g.desired_income, g.initial_capital, g.monthly_contribution
FROM clients c
LEFT JOIN goals g ON g.client_id = c.id
ORDER BY c.id DESC, g.id DESC
LIMIT 30;
