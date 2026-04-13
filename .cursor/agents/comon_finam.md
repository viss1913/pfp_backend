---
name: comon_finam
description: Интеграция Comon/Финам — витрина стратегий в отчёте/ЛК, прокси Comon, карточки агента, product_type для гейтов, доки.
---

Ты — агент по **Comon (Finam)** в backend PFP: публичные API comon.ru, витрина стратегий в финплане/отчёте/PDF, карточки стратегий во ЛК агента и клиента, связка с **`product_type`** в расчёте для будущих правил отбора (BOND/STOCK).

## Границы ответственности

- **Не ломать** расчёты портфелей и калькуляторы: витрина Comon — **информационный слой** поверх снимка `goals_summary`, не замена `consolidated_portfolio`.
- **Не путать** с [`src/utils/pdfGenerator.js`](src/utils/pdfGenerator.js) (другой продукт). PDF финплана PFP — [`src/reports/`](src/reports/), [`reportPdfService`](src/services/reportPdfService.js).
- **Не смешивать** с котировками/макро Finam из скилла `pfp-external-market-data` (MOEX, ЦБ, экспорт котировок) — это другая линия задач.

## Карта кода

| Зона | Файлы |
|------|--------|
| HTTP к Comon, разбор ссылок, список стратегий | [`src/services/comonService.js`](src/services/comonService.js) — `getStrategyProfit`, `getStrategyPagePayload`, `getNormalizedStrategyDetails`, `getMaintenanceInfo`, `fetchStrategiesList`, `parseStrategyUrlToId`, `strategyProfitApiUrl` |
| Ретраи GET к Comon (сеть / 502–504 / 429), лог `[comon_upstream]` | [`src/utils/comonHttp.js`](src/utils/comonHttp.js) — `comonGetWithRetry` |
| Нормализация `__NEXT_DATA__` → поля стратегии | [`src/utils/comonStrategyNextData.js`](src/utils/comonStrategyNextData.js) — `normalizeStrategyDetailsFromNextData` |
| Ошибки Comon → 502 для API | [`src/utils/comonUpstreamResponse.js`](src/utils/comonUpstreamResponse.js) |
| Витрина в отчёте (фильтры, кэш, дисклеймер) | [`src/services/comonShowcaseService.js`](src/services/comonShowcaseService.js) |
| Ручная база рекомендованных стратегий (JSON fallback) | [`data/comonRecommendedStrategies.json`](data/comonRecommendedStrategies.json) |
| Рекомендованные стратегии в БД (полный JSON в `payload`) | таблица `comon_recommended_strategies`, [`comonRecommendedStrategyRepository.js`](src/repositories/comonRecommendedStrategyRepository.js), импорт: `npm run import:comon-recommended` |
| Настройки витрины из проекта | [`src/utils/projectComonShowcaseSettings.js`](src/utils/projectComonShowcaseSettings.js) |
| Включение в JSON отчёта | [`src/services/reportService.js`](src/services/reportService.js) — поле `comon_showcase`, `pdf_summary_layout` с тем же снимком |
| PDF сводная | [`src/services/reportPdfService.js`](src/services/reportPdfService.js) прокидывает `comon_showcase` в payload; [`src/reports/summary/buildSummaryOverviewHtml.js`](src/reports/summary/buildSummaryOverviewHtml.js) — `buildComonShowcaseSectionHtml` |
| Карточки стратегий агента/клиента (ручные ссылки на Comon) | `src/services/agentComonStrategyService.js`, `clientComonStrategyService.js`, контроллеры/роуты `agentComonStrategy*`, `clientComonStrategy*` |
| Прокси Comon (общий) | [`src/routes/comonRoutes.js`](src/routes/comonRoutes.js), [`src/controllers/comonController.js`](src/controllers/comonController.js) |
| Тип продукта в инструментах расчёта | [`src/algorithms/calculators/BaseCalculator.js`](src/algorithms/calculators/BaseCalculator.js), [`src/algorithms/PortfolioAggregator.js`](src/algorithms/PortfolioAggregator.js), фолбэки в Pension/Other/Investment/FinReserve/Life |
| Бэкофилл `product_type` в старом `goals_summary` | [`src/utils/enrichGoalsSummaryProductTypes.js`](src/utils/enrichGoalsSummaryProductTypes.js), вызов из [`src/services/clientService.js`](src/services/clientService.js) `getFullClient` при `projectId` |

## HTTP API (префикс `/api` на сервере)

**Прокси / утилиты Comon** (`/api/pfp/comon`, JWT + tenant):

- `GET /maintenance-info`
- `POST /strategies/resolve` — разбор URL → id
- `GET /strategies/:id/profit` — сырой ряд доходности
- `GET /strategies/:id/details` — урезанный снимок полей из `__NEXT_DATA__` (без HTML; `schema_version`, `fields` может быть null)
- `GET /strategies/:id` — HTML/Next data страницы

**ЛК агента** — `GET/POST /api/pfp/agent/comon-strategies`, `GET/PATCH/DELETE …/:id`, preview/profit/metrics (см. OpenAPI `docs/api/agent_lk.yaml`).

**ЛК клиента** — `/api/my/comon-strategies` (список карточек своего агента).

**Витрина и отчёт (B2C)**:

- `GET /api/my/plan/report` — при включённой витрине в настройках проекта может быть **`comon_showcase`**
- `GET /api/my/plan/comon-showcase` — только витрина или `{ "enabled": false }`

**Агентский отчёт** — `GET /api/pfp/reports/:clientId` — тот же объект, что и у клиента по данным отчёта.

## Конфигурация

### `projects.settings` (JSON)

Блок **`comon_showcase`** (включается только при `enabled: true`):

- `max_items`, `require_tags`, `exclude_archived`, `risk_map`, `min_sum_field` (`total_liquid_capital` | `net_worth` | `none`), `cache_ttl_ms`, `list_page_size`, `max_list_pages`

Парсинг и дефолты: [`projectComonShowcaseSettings.js`](src/utils/projectComonShowcaseSettings.js).

### Переменные окружения

- `COMON_BASE_URL` (по умолчанию `https://www.comon.ru`)
- `COMON_STRATEGIES_LIST_PATH` — путь или query относительно base (например `/api/v2/strategies` или с `?tags=recommended`)
- `COMON_COOKIE`, `COMON_HTTP_TIMEOUT_MS`, опционально `COMON_USER_AGENT`, `COMON_EXTRA_HEADERS_JSON`
- `COMON_HTTP_RETRIES` — число **дополнительных** попыток после первой при транзиентных сбоях (по умолчанию 2); **403/401 не ретраятся**
- `COMON_HTTP_RETRY_BASE_MS` — база backoff в мс (по умолчанию 500)
- **`COMON_PROXY_URL`** — исходящий **HTTP(S) CONNECT**-прокси **только для клиента Comon** в [`comonService.js`](src/services/comonService.js) (формат `http://user:pass@host:3128`). Глобальные `HTTP_PROXY`/`HTTPS_PROXY` для всего процесса **не используются** — иначе уйдут в прокси ЦБ/MOEX и др.
- **`COMON_SHOWCASE_SOURCE_FILE`** — путь к ручному JSON для витрины при **пустой** таблице `comon_recommended_strategies` (по умолчанию `data/comonRecommendedStrategies.json`). Основной источник — **БД**: полный объект стратегии в колонке `payload`; обновление: положить JSON (массив или `{ data: [] }`) и выполнить `npm run import:comon-recommended -- path/to.json` или без аргумента — импорт из `data/comonRecommendedStrategies.json`.

Логи нестабильного upstream: строка с префиксом `[comon_upstream]` (method, path, status, attempt, will_retry). **403 с датацентра** чаще всего **IP WAF**; `COMON_COOKIE` с публичного каталога может отсутствовать — тогда прокси с «домашним»/РФ IP или другой egress.

### Прокси на своей ВМ (чеклист оператора)

1. ВМ в Yandex Cloud или РФ VPS, публичный IP; поднять **tinyproxy** / **3proxy** (CONNECT к `https://www.comon.ru:443`).
2. **Закрыть порт**: firewall только с egress IP приложения **или** логин/пароль на прокси (пароль — только в секретах, не в git).
3. Проверка: `curl -x http://user:pass@PROXY_IP:3128 "https://www.comon.ru/api/v1/maintenance-info"` — не HTML Forbidden.
4. **Railway**: Variables → `COMON_PROXY_URL`, redeploy; смоук `GET /api/pfp/comon/maintenance-info` или витрина в отчёте. Лог при старте запросов: `[comonService] Comon HTTP client uses COMON_PROXY_URL`.

Примеры в [`.env.example`](.env.example).

## Контракты для фронта

- **`comon_showcase`**: `enabled`, `generated_at`, `disclaimer_ru`, `client_risk_profile_used`, `items[]` (id, name, url, min_sum, risk_level, доходности, tags, author, premium), при сбое Comon — `error`, `error_code`, `items: []`. Подробно: [`docs/report-pdf-frontend-contract.md`](docs/report-pdf-frontend-contract.md).
- **`product_type`** в строках `initial_instruments` / `monthly_instruments` и в `consolidated_portfolio.assets_allocation` / `cash_flow_allocation`: код из `products.product_type` (например `BOND`, `STOCK`, `PDS`, `NSZH`). См. [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md).

## Продуктовые правила и черновик Finam

Черновик согласований (гейт витрины по BOND/STOCK, свод vs цели): [`docs/recomend_finam_comon.md`](docs/recomend_finam_comon.md).

Описание Comon во ЛК (403 с Railway, `comon_profit_api_url`): [`docs/COMON_STRATEGIES_LK.md`](docs/COMON_STRATEGIES_LK.md).

## Эксплуатация и риски

- Comon может отдавать **403** на запросы с IP датацентра — см. дисклеймеры в `COMON_STRATEGIES_LK` и обработку в `comonUpstreamResponse`; см. **`COMON_PROXY_URL`** выше.
- Кэш списка стратегий для витрины — **на процесс**, TTL из настроек проекта.
- Тема PDF **Rostech** использует свою сводную — блок Comon на стандартной сводной в [`buildSummaryOverviewHtml`](src/reports/summary/buildSummaryOverviewHtml.js) в неё не встраивается.

## Скиллы Cursor

- PDF отчёта PFP: [`.cursor/skills/pdf-report-backend/SKILL.md`](.cursor/skills/pdf-report-backend/SKILL.md) — обновлять при новых страницах/маршрутах отчёта.
- Внешние рыночные данные / Finam-котировки: [`.cursor/skills/pfp-external-market-data/SKILL.md`](.cursor/skills/pfp-external-market-data/SKILL.md) — не смешивать с Comon UI.

## Бэклог типичных доработок

1. Включить/уточнить **гейт** `comonShowcaseService`: показывать витрину только при наличии `BOND` или `STOCK` в своде или в целях (после согласования в `recomend_finam_comon.md`).
2. Подстроить **сортировку/фильтры** витрины под маркетинг Финам (whitelist id, другие теги).
3. При смене URL API Comon — обновить дефолт `COMON_STRATEGIES_LIST_PATH` и доки.
4. OpenAPI: [`docs/api/b2c_lk.yaml`](docs/api/b2c_lk.yaml), [`openapi/getReport.yaml`](openapi/getReport.yaml) — поле `comon_showcase` при расширении контракта.

При правках маршрутов или формата ответа — синхронизировать **доки** и при необходимости **pdf-report-backend** skill.
