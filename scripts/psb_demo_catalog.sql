-- Демо-каталог ПСБ для project_id=2 на стенде АВ.
-- Идемпотентно: гасит прочий активный каталог проекта и заново создаёт продукты/портфели с префиксом «ПСБ:».

START TRANSACTION;

SET @pid = 2;
SET @amt_to = 999999999999.99;

SELECT classes INTO @src_classes
FROM portfolios
WHERE project_id = @pid AND is_active = 1 AND classes IS NOT NULL
LIMIT 1;

DROP TEMPORARY TABLE IF EXISTS psb_src_class_ids;
CREATE TEMPORARY TABLE psb_src_class_ids (class_id INT PRIMARY KEY);
INSERT IGNORE INTO psb_src_class_ids (class_id)
SELECT DISTINCT l.class_id
FROM portfolio_class_links l
JOIN portfolios p ON p.id = l.portfolio_id
WHERE p.project_id = @pid AND p.is_active = 1;

UPDATE products
SET is_active = 0
WHERE project_id = @pid AND is_active = 1 AND name NOT LIKE 'ПСБ:%';

UPDATE portfolios
SET is_active = 0
WHERE project_id = @pid AND is_active = 1 AND name NOT LIKE 'ПСБ:%';

DELETE pi FROM portfolio_instruments pi
JOIN portfolio_risk_profiles pr ON pr.id = pi.portfolio_risk_profile_id
JOIN portfolios p ON p.id = pr.portfolio_id
WHERE p.project_id = @pid AND p.name LIKE 'ПСБ:%';

DELETE pr FROM portfolio_risk_profiles pr
JOIN portfolios p ON p.id = pr.portfolio_id
WHERE p.project_id = @pid AND p.name LIKE 'ПСБ:%';

DELETE l FROM portfolio_class_links l
JOIN portfolios p ON p.id = l.portfolio_id
WHERE p.project_id = @pid AND p.name LIKE 'ПСБ:%';

DELETE FROM portfolios WHERE project_id = @pid AND name LIKE 'ПСБ:%';
DELETE FROM products WHERE project_id = @pid AND name LIKE 'ПСБ:%';

INSERT INTO products
  (project_id, agent_id, name, product_type, currency, min_term_months, max_term_months, min_amount, max_amount, is_active, is_default, lines, commission_schema, created_at, updated_at)
VALUES
  (@pid, NULL, 'ПСБ: Накопительный счёт', 'DEPOSIT', 'RUB', 0, 18, 0, @amt_to, 1, 0,
   JSON_ARRAY(JSON_OBJECT('min_term_months', 0, 'max_term_months', 18, 'min_amount', 0, 'max_amount', @amt_to, 'yield_percent', 12)),
   JSON_OBJECT('version', 1, 'rules', JSON_ARRAY(JSON_OBJECT('rule_type', 'ONE_TIME_PERCENT_OF_PREMIUM', 'base', 'INITIAL', 'rate_percent', 0))),
   NOW(), NOW()),
  (@pid, NULL, 'ПСБ: Депозит', 'DEPOSIT', 'RUB', 3, 36, 0, @amt_to, 1, 0,
   JSON_ARRAY(JSON_OBJECT('min_term_months', 3, 'max_term_months', 36, 'min_amount', 0, 'max_amount', @amt_to, 'yield_percent', 13.6)),
   JSON_OBJECT('version', 1, 'rules', JSON_ARRAY(JSON_OBJECT('rule_type', 'ONE_TIME_PERCENT_OF_PREMIUM', 'base', 'INITIAL', 'rate_percent', 0))),
   NOW(), NOW()),
  (@pid, NULL, 'ПСБ: Жить всласть 3 года', 'ISZH', 'RUB', 36, 59, 0, @amt_to, 1, 0,
   JSON_ARRAY(JSON_OBJECT('min_term_months', 36, 'max_term_months', 59, 'min_amount', 0, 'max_amount', @amt_to, 'yield_percent', 10.38, 'risk_name', 'Дожитие')),
   JSON_OBJECT('version', 1, 'rules', JSON_ARRAY(JSON_OBJECT('rule_type', 'ONE_TIME_PERCENT_OF_PREMIUM', 'base', 'INITIAL', 'rate_percent', 3))),
   NOW(), NOW()),
  (@pid, NULL, 'ПСБ: Жить всласть 5 лет', 'ISZH', 'RUB', 60, 360, 0, @amt_to, 1, 0,
   JSON_ARRAY(JSON_OBJECT('min_term_months', 60, 'max_term_months', 360, 'min_amount', 0, 'max_amount', @amt_to, 'yield_percent', 11.2, 'risk_name', 'Дожитие')),
   JSON_OBJECT('version', 1, 'rules', JSON_ARRAY(JSON_OBJECT('rule_type', 'ONE_TIME_PERCENT_OF_PREMIUM', 'base', 'INITIAL', 'rate_percent', 3))),
   NOW(), NOW()),
  (@pid, NULL, 'ПСБ: Облигации', 'BOND', 'RUB', 12, 120, 0, @amt_to, 1, 0,
   JSON_ARRAY(JSON_OBJECT('min_term_months', 12, 'max_term_months', 120, 'min_amount', 0, 'max_amount', @amt_to, 'yield_percent', 14.5)),
   JSON_OBJECT('version', 1, 'rules', JSON_ARRAY(JSON_OBJECT('rule_type', 'ONE_TIME_PERCENT_OF_PREMIUM', 'base', 'INITIAL', 'rate_percent', 0.5))),
   NOW(), NOW()),
  (@pid, NULL, 'ПСБ: Акции', 'STOCK', 'RUB', 36, 360, 0, @amt_to, 1, 0,
   JSON_ARRAY(JSON_OBJECT('min_term_months', 36, 'max_term_months', 360, 'min_amount', 0, 'max_amount', @amt_to, 'yield_percent', 21)),
   JSON_OBJECT('version', 1, 'rules', JSON_ARRAY(JSON_OBJECT('rule_type', 'ONE_TIME_PERCENT_OF_PREMIUM', 'base', 'INITIAL', 'rate_percent', 0.5))),
   NOW(), NOW()),
  (@pid, NULL, 'ПСБ: ПДС НПФ ПСБ', 'PDS', 'RUB', 36, 360, 0, @amt_to, 1, 0,
   JSON_ARRAY(JSON_OBJECT('min_term_months', 36, 'max_term_months', 360, 'min_amount', 0, 'max_amount', @amt_to, 'yield_percent', 13.5)),
   JSON_OBJECT('version', 1, 'rules', JSON_ARRAY(JSON_OBJECT('rule_type', 'AUM_MANAGEMENT_FEE', 'base', 'AUM_AVG', 'rate_percent', 1))),
   NOW(), NOW());

SET @sav = (SELECT id FROM products WHERE project_id=@pid AND name='ПСБ: Накопительный счёт' ORDER BY id DESC LIMIT 1);
SET @dep = (SELECT id FROM products WHERE project_id=@pid AND name='ПСБ: Депозит' ORDER BY id DESC LIMIT 1);
SET @iszh3 = (SELECT id FROM products WHERE project_id=@pid AND name='ПСБ: Жить всласть 3 года' ORDER BY id DESC LIMIT 1);
SET @iszh5 = (SELECT id FROM products WHERE project_id=@pid AND name='ПСБ: Жить всласть 5 лет' ORDER BY id DESC LIMIT 1);
SET @bond = (SELECT id FROM products WHERE project_id=@pid AND name='ПСБ: Облигации' ORDER BY id DESC LIMIT 1);
SET @stock = (SELECT id FROM products WHERE project_id=@pid AND name='ПСБ: Акции' ORDER BY id DESC LIMIT 1);
SET @pds = (SELECT id FROM products WHERE project_id=@pid AND name='ПСБ: ПДС НПФ ПСБ' ORDER BY id DESC LIMIT 1);

INSERT INTO portfolios
  (project_id, agent_id, name, currency, amount_from, amount_to, term_from_months, term_to_months, is_active, is_default, classes, risk_profiles, created_at, updated_at)
VALUES
  (@pid, NULL, 'ПСБ: До года', 'RUB', 0, @amt_to, 0, 12, 1, 0, @src_classes,
   JSON_ARRAY(JSON_OBJECT('profile_type','BALANCED','risk_profile','BALANCED','potential_yield_percent', 13.0, 'instruments', JSON_ARRAY(
     JSON_OBJECT('product_id', @dep, 'share_percent', 60, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 1),
     JSON_OBJECT('product_id', @sav, 'share_percent', 40, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 2),
     JSON_OBJECT('product_id', @dep, 'share_percent', 60, 'bucket_type', 'TOP_UP', 'order_index', 3),
     JSON_OBJECT('product_id', @sav, 'share_percent', 40, 'bucket_type', 'TOP_UP', 'order_index', 4)
   ))), NOW(), NOW()),
  (@pid, NULL, 'ПСБ: 1–3 года', 'RUB', 0, @amt_to, 12, 36, 1, 0, @src_classes,
   JSON_ARRAY(JSON_OBJECT('profile_type','BALANCED','risk_profile','BALANCED','potential_yield_percent', 13.6, 'instruments', JSON_ARRAY(
     JSON_OBJECT('product_id', @dep, 'share_percent', 40, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 1),
     JSON_OBJECT('product_id', @bond, 'share_percent', 40, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 2),
     JSON_OBJECT('product_id', @sav, 'share_percent', 20, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 3),
     JSON_OBJECT('product_id', @dep, 'share_percent', 40, 'bucket_type', 'TOP_UP', 'order_index', 4),
     JSON_OBJECT('product_id', @bond, 'share_percent', 40, 'bucket_type', 'TOP_UP', 'order_index', 5),
     JSON_OBJECT('product_id', @sav, 'share_percent', 20, 'bucket_type', 'TOP_UP', 'order_index', 6)
   ))), NOW(), NOW()),
  (@pid, NULL, 'ПСБ: 3–5 лет', 'RUB', 0, @amt_to, 36, 60, 1, 0, @src_classes,
   JSON_ARRAY(JSON_OBJECT('profile_type','BALANCED','risk_profile','BALANCED','potential_yield_percent', 12.8, 'instruments', JSON_ARRAY(
     JSON_OBJECT('product_id', @iszh3, 'share_percent', 35, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 1),
     JSON_OBJECT('product_id', @bond, 'share_percent', 35, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 2),
     JSON_OBJECT('product_id', @pds, 'share_percent', 20, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 3),
     JSON_OBJECT('product_id', @dep, 'share_percent', 10, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 4),
     JSON_OBJECT('product_id', @iszh3, 'share_percent', 35, 'bucket_type', 'TOP_UP', 'order_index', 5),
     JSON_OBJECT('product_id', @bond, 'share_percent', 35, 'bucket_type', 'TOP_UP', 'order_index', 6),
     JSON_OBJECT('product_id', @pds, 'share_percent', 20, 'bucket_type', 'TOP_UP', 'order_index', 7),
     JSON_OBJECT('product_id', @dep, 'share_percent', 10, 'bucket_type', 'TOP_UP', 'order_index', 8)
   ))), NOW(), NOW()),
  (@pid, NULL, 'ПСБ: 5–10 лет', 'RUB', 0, @amt_to, 60, 120, 1, 0, @src_classes,
   JSON_ARRAY(JSON_OBJECT('profile_type','BALANCED','risk_profile','BALANCED','potential_yield_percent', 15.4, 'instruments', JSON_ARRAY(
     JSON_OBJECT('product_id', @stock, 'share_percent', 30, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 1),
     JSON_OBJECT('product_id', @bond, 'share_percent', 25, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 2),
     JSON_OBJECT('product_id', @iszh5, 'share_percent', 25, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 3),
     JSON_OBJECT('product_id', @pds, 'share_percent', 20, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 4),
     JSON_OBJECT('product_id', @stock, 'share_percent', 30, 'bucket_type', 'TOP_UP', 'order_index', 5),
     JSON_OBJECT('product_id', @bond, 'share_percent', 25, 'bucket_type', 'TOP_UP', 'order_index', 6),
     JSON_OBJECT('product_id', @iszh5, 'share_percent', 25, 'bucket_type', 'TOP_UP', 'order_index', 7),
     JSON_OBJECT('product_id', @pds, 'share_percent', 20, 'bucket_type', 'TOP_UP', 'order_index', 8)
   ))), NOW(), NOW()),
  (@pid, NULL, 'ПСБ: 10+ лет', 'RUB', 0, @amt_to, 120, 360, 1, 0, @src_classes,
   JSON_ARRAY(JSON_OBJECT('profile_type','BALANCED','risk_profile','BALANCED','potential_yield_percent', 17.1, 'instruments', JSON_ARRAY(
     JSON_OBJECT('product_id', @stock, 'share_percent', 50, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 1),
     JSON_OBJECT('product_id', @bond, 'share_percent', 20, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 2),
     JSON_OBJECT('product_id', @iszh5, 'share_percent', 15, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 3),
     JSON_OBJECT('product_id', @pds, 'share_percent', 15, 'bucket_type', 'INITIAL_CAPITAL', 'order_index', 4),
     JSON_OBJECT('product_id', @stock, 'share_percent', 50, 'bucket_type', 'TOP_UP', 'order_index', 5),
     JSON_OBJECT('product_id', @bond, 'share_percent', 20, 'bucket_type', 'TOP_UP', 'order_index', 6),
     JSON_OBJECT('product_id', @iszh5, 'share_percent', 15, 'bucket_type', 'TOP_UP', 'order_index', 7),
     JSON_OBJECT('product_id', @pds, 'share_percent', 15, 'bucket_type', 'TOP_UP', 'order_index', 8)
   ))), NOW(), NOW());

INSERT INTO portfolio_class_links (portfolio_id, class_id)
SELECT p.id, c.class_id
FROM portfolios p
JOIN psb_src_class_ids c
WHERE p.project_id = @pid AND p.name LIKE 'ПСБ:%';

COMMIT;

SELECT id, name, is_active FROM products WHERE project_id = 2 AND name LIKE 'ПСБ:%';
SELECT id, name, term_from_months, term_to_months, is_active FROM portfolios WHERE project_id = 2 AND name LIKE 'ПСБ:%';
