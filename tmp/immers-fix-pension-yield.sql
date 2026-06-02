INSERT INTO system_settings (`key`, value, value_type, description, category, project_id)
SELECT 'passive_income_yield',
  '[{"min_term_months":0,"max_term_months":360,"min_amount":0,"max_amount":1000000000000,"yield_percent":14.0}]',
  'json',
  'Линии доходности пассивного дохода / выплат по пенсии (до 30 лет)',
  'passive_income',
  NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE `key`='passive_income_yield' AND project_id IS NULL);

UPDATE system_settings
SET value='[{"min_term_months":0,"max_term_months":360,"min_amount":0,"max_amount":1000000000000,"yield_percent":14.0}]'
WHERE `key`='passive_income_yield';

UPDATE clients
SET report_pdf_status=NULL, report_pdf_url=NULL, report_pdf_generated_at=NULL, report_pdf_error=NULL
WHERE project_id=2;

SELECT `key`, LEFT(value, 80) AS val, project_id FROM system_settings WHERE `key`='passive_income_yield';
