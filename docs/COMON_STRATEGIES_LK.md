# Стратегии Comon: ЛК агента и ЛК клиента

Описание для продуктов, фронта и поддержки.

## ЛК агента

**Задача:** агент ведёт карточки стратегий с ссылкой на Comon, текстом для клиента, риском, портфелем из двух инструментов; бэкенд тянет ряд доходности и считает метрики.

**API** (JWT агента, `/api`):

- `GET/POST /pfp/agent/comon-strategies`
- `GET/PATCH/DELETE /pfp/agent/comon-strategies/:id`
- `GET /pfp/agent/comon-strategies/:id/preview` — **одним запросом** карточка + ряд Comon + метрики (удобно показать агенту график и цифры во ЛК)
- `GET /pfp/agent/comon-strategies/:id/profit` — только сырой ряд Comon
- `GET /pfp/agent/comon-strategies/:id/profit/metrics` — только метрики
- `POST /pfp/comon/strategies/resolve` — разбор ссылки в id (общий Comon-роут)

**Поля:** `comon_url`, `name`, `min_contribution`, `risk_profile` (conservative | balanced | aggressive), `description`, `portfolio` (2× `instrument` + `share_percent`).

**Ответ карточки:** плюс `comon_profit_api_url` (URL вида `https://www.comon.ru/api/v2/strategies/{id}/profit`).

**Тексты UI (подсказки):** заголовок «Стратегии (Comon)»; подзаголовок про то, что карточки видят закреплённые клиенты; при дубликате Comon-id — «Эта стратегия уже в списке».

## ЛК клиента

**Задача:** клиент видит только стратегии своего агента (`clients.agent_id`). Без агента — пустой список и пояснение.

**API** (роль client, `/api/my`):

- `GET /my/comon-strategies`
- `GET /my/comon-strategies/:id`
- `GET /my/comon-strategies/:id/profit`
- `GET /my/comon-strategies/:id/profit/metrics`

`:id` — внутренний id записи, не id Comon.

**В ответе:** `disclaimer_ru` (ознакомительный характер, не рекомендация, прошлое не гарантирует будущее); у карточки — `risk_profile_label_ru` на русском.

**Тексты UI:** «Стратегии вашего консультанта»; дисклеймер на экране обязательно; график лучше с бэка (`/profit`) из‑за CORS.

## Метрики

Смысл полей — в `metrics.definitions` в JSON. Код: `src/utils/comonProfitMetrics.js`.

## База

Таблица `agent_comon_strategies` (миграция `20260322153000_create_agent_comon_strategies.js`).

## Окружение

`COMON_BASE_URL`, при необходимости `COMON_COOKIE` / `COMON_EXTRA_HEADERS_JSON`.

## 403 / 502 с Railway и других датацентров

Comon может отвечать **403 HTML** («Forbidden», «If you are not a bot») на запросы **с IP сервера** (Railway, AWS и т.д.) — это защита у них, не «баг» нашего кода. Бэкенд отдаёт **502** с `code: COMON_FORBIDDEN` и пояснением в `error` / `message`.

**Что делать:** (1) График и сырые точки запрашивать **с фронта** по полю `comon_profit_api_url` (браузерный IP часто не режут; нужен доступный CORS у Comon). (2) Либо выставить **`COMON_COOKIE`** — куки с залогиненной сессии comon.ru (хрупко, ротация). (3) Либо договориться с Comon про **allowlist IP** или официальный API.

На запросах к `/api/v2/strategies/.../profit` бэкенд дополнительно шлёт **Referer** и **Origin** как со страницы стратегии — иногда этого достаточно, часто — нет.

## OpenAPI (Swagger)

- **`openapi/pfp-api.yaml`** — то, что открывается в **`/api-docs`** на бэке.
- **`docs/api/agent_lk.yaml`** — ЛК агента: Comon (общие пути `/pfp/comon/...`) + CRUD `/pfp/agent/comon-strategies`, схемы тел и ответов в `components.schemas`.
- **`docs/api/b2c_lk.yaml`** — ЛК клиента: `/my/comon-strategies/...` и схемы карточки без `agent_id` + `risk_profile_label_ru`.

## Код

- `src/utils/comonProfitMetrics.js`
- `src/services/agentComonStrategyService.js`
- `src/services/clientComonStrategyService.js`
- `src/services/comonService.js`
