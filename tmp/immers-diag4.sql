SELECT id, `key`, LEFT(value, 120) AS val, project_id FROM system_settings
WHERE `key` LIKE '%passive%' OR `key` LIKE '%pension%' OR `key` LIKE '%inflation%'
ORDER BY project_id, `key`;

SELECT id, client_id, goal_type_id, calculation_result IS NOT NULL AS has_calc
FROM goals WHERE client_id=2;
