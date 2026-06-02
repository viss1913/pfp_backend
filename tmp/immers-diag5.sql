SELECT id, `key`, project_id FROM system_settings WHERE `key`='passive_income_yield';
SELECT id, goals_summary IS NOT NULL AS has_gs, LENGTH(goals_summary) AS len FROM clients WHERE id=2;
