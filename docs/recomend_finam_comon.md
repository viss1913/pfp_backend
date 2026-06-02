# Finam / Comon — откуда смотреть портфель и когда показывать витрину

Черновик для согласования логики с продуктом и комплаенсом. Реализация в бэке: `comonShowcaseService`, настройки `projects.settings.comon_showcase`.

---

## 1. Два источника структуры портфеля в отчёте / снимке расчёта

### A. Свод по всему плану

**Путь:** `summary.consolidated_portfolio.assets_allocation` (и при необходимости `cash_flow_allocation` для пополнений).

Пример смысла строк:

- `name`, `share`, `yield`, `amount`, `short_term_yield` — агрегат по **имени инструмента** со всех целей (как собирает `PortfolioAggregator`).

**Когда опираться на свод:** нужна одна проверка «в плане вообще есть рынок (облигации/акции) или нет» — без разборки по целям.

### B. Внутри каждой цели

**Путь:** у цели в расчёте обычно `details.initial_instruments` и `details.monthly_instruments` (названия полей в JSON цели могут совпадать с этими).

**Когда опираться на цели:** если решим показывать Comon **только** для определённых типов целей (например `INVESTMENT`) или считать доли облигаций/акций **по релевантной цели**, а не по всему плану.

---

## 2. Условие показа витрины: только при наличии STOCK (реализовано)

**Продуктовое правило (Finam):** блок Comon в отчёте и PDF v2 — **только если** в сводном портфеле есть **`product_type: STOCK`** в `summary.consolidated_portfolio.assets_allocation` и/или `cash_flow_allocation`. Облигации одни (**BOND**) витрину **не включают**.

Код: `src/utils/comonShowcaseGate.js`, `comonShowcaseService.buildForClient` → при отсутствии STOCK: `{ enabled: false, skip_reason: 'no_stock_in_plan', items: [] }`. Лист `page-comon-autofollow-v2` в PDF не вставляется без непустого `items`.

Настройка проекта: `projects.settings.comon_showcase.gate_product_types` (по умолчанию `["STOCK"]`).

**Данные в API (реализовано):** в элементах `initial_instruments` / `monthly_instruments` и в `summary.consolidated_portfolio.{assets_allocation,cash_flow_allocation}` добавлено поле **`product_type`** — строка в верхнем регистре из колонки `products.product_type` (например `BOND`, `STOCK`, `PDS`, `NSZH`). Для синтетических строк без продукта может быть `null`.

- Новые расчёты (`first-run`, `recalculate`) сразу содержат `product_type`.
- **`GET /api/client/:id`** (и любой `getFullClient` с `projectId`): для **старых** снимков `goals_summary` без поля выполняется догрузка типа по **`products.name`** (`enrichGoalsSummaryProductTypes`).

Дополнительный **B. справочник по имени** в настройках проекта для Comon остаётся опциональным, если имена в снимке не совпадают с `products.name`.

---

## 3. Как выбирать, *откуда* проверять (свод vs цели)

Предлагаемая схема решений (можно зафиксировать флагом в `comon_showcase`):

1. **Режим `plan`** (по умолчанию):  
   - Сканируем **`consolidated_portfolio.assets_allocation`**.  
   - Если есть хотя бы один инструмент с классом **STOCK** → витрина **разрешена**.  
   - Иначе → **не показываем** витрину (или отдаём `comon_showcase: null` / `{ enabled: false, skip_reason: 'no_stock_in_plan' }`).

2. **Режим `goals`:**  
   - Идём по целям из `goals_detailed` (или эквивалент в снимке).  
   - Опционально фильтр только `goal_type === 'INVESTMENT'` (если продукт так решит).  
   - Если **хотя бы в одной** подходящей цели в `details.initial_instruments` (и/или `monthly_instruments`) есть BOND/STOCK → витрина разрешена.

3. **Строгий вариант:** требовать и свод, и цель — обычно избыточно; достаточно одного источника истины, чтобы не было противоречий.

**Несогласованность свод vs цель:** если свод есть, а по целям временно нет классов — до внедрения кодов лучше опираться на один выбранный режим и не смешивать.

---

## 3.1. Каталог recommended с Comon (cron на immers)

- API: `GET https://www.comon.ru/api/v2/strategies/?tags=recommended` (пагинация `page`, `pageSize`).
- Синк в БД: `npm run sync:comon-recommended` → [`scripts/sync_comon_recommended_strategies.js`](../scripts/sync_comon_recommended_strategies.js), таблица `comon_recommended_strategies`.
- Sync идёт **явно** в `/api/v2/strategies` с query `tags=recommended`; daily cron не зависит от `COMON_STRATEGIES_LIST_PATH`.
- Если Comon вернул больше страниц, чем разрешено `COMON_SYNC_MAX_PAGES`, sync завершится ошибкой и не заменит каталог частичным ответом.
- Ручной импорт из JSON по-прежнему: `npm run import:comon-recommended`.
- Рекомендуемый cron на VM: `0 4 * * * docker compose exec -T backend node scripts/sync_comon_recommended_strategies.js`.

Витрина в отчёте читает **БД** (кэш процесса), не live API на каждый PDF.

---

## 4. Как выбирать *какие* стратегии Comon показывать (после того как витрина разрешена)

Это **отдельный слой** от фильтра BOND/STOCK:

- Уже реализовано в бэке: теги (`require_tags`), риск клиента (`risk_map` ↔ `riskLevel` Comon), минималка (`min_sum` vs `total_liquid_capital` / `net_worth`), сортировка по `strategyRating` / `annualAverageProfit`, топ `max_items`.
- **Опционально усилить под Finam (следующий этап):**  
  - если в плане преобладает доля **STOCK** — сдвигать отбор к стратегиям с выше допустимым `riskLevel` или отдельным тегам;  
  - если преобладает **BOND** — наоборот консервативнее;  
  - это только после того, как в данных плана стабильно известны доли BOND/STOCK (свод по классам, а не только по именам).

---

## 5. Что положить сюда от Финам (черновик для вставки)

- Подтверждение: показываем Comon **только** при BOND/STOCK или есть исключения?  
- Режим: только свод / только INVESTMENT-цели / оба.  
- Список **точных** имён продуктов или кодов `product_type` из БД, которые считаются BOND/STOCK для автоследования.  
- Нужен ли в API явный `skip_reason` для фронта при скрытой витрине.
