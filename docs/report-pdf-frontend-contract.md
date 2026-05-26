# PDF отчёт: контракт для фронта (ЛК клиента и ЛК агента)

## Базовые правила доступа

- Всегда передавать `Authorization: Bearer <jwt>`.
- Без JWT: `401`.
- С JWT, но без прав на клиента: `403`.
- PDF-ответ бинарный (`application/pdf`), на фронте запрашивать как `blob`.

## ЛК клиента

- Эндпоинт: `GET /api/my/plan/report/pdf`
- Кого возвращает: только клиента из `req.user.clientId` (из токена).
- `clientId` в URL не нужен и не используется.

### Быстрый HTML-просмотр

- Цельный HTML-документ: `GET /api/my/plan/report/html?format=html`
- JSON-ответ: `GET /api/my/plan/report/html`
- По умолчанию JSON возвращает `html`, `toc`, `report_schema_version`, `generated_at`
- `pages[]` приходит только при `includePages=1`

### Query-параметры

- `includeCover=1|0` (по умолчанию `1`)
- `includeSummary=1|0` (по умолчанию `1`)
- `goalTypes=PENSION,LIFE,INVESTMENT,OTHER,FIN_RESERVE` (опционально, CSV)
- `disposition=attachment` (если нужно принудительное скачивание)

### PDF URL для тяжёлого отчёта

- Эндпоинт: `GET /api/my/plan/report/pdf-url`
- Для UI это предпочтительнее синхронного `/pdf`, если нужен быстрый ответ со ссылкой на готовый файл
- Если PDF уже в кеше, backend сразу вернёт `status: ready` и `pdf_url`
- Если PDF ещё собирается, backend вернёт `status: processing`

### Пример

`GET /api/my/plan/report/pdf?includeCover=1&includeSummary=1&disposition=attachment`

## ЛК агента

- Эндпоинт: `GET /api/pfp/reports/:clientId/pdf`
- Доступ только к клиентам агента (проверка `client.agent_id === req.user.agentId`).
- Для `admin/super_admin` доступ разрешён по проекту.

### Быстрый HTML-просмотр

- Цельный HTML-документ: `GET /api/pfp/reports/:clientId/html?format=html`
- JSON-ответ: `GET /api/pfp/reports/:clientId/html`
- По умолчанию JSON возвращает `html`, `toc`, `report_schema_version`, `generated_at`
- `pages[]` приходит только при `includePages=1`

### Query-параметры

- `includeCover=1|0`
- `includeSummary=1|0`
- `goalTypes=...` (CSV)
- `disposition=attachment`

### PDF URL для тяжёлого отчёта

- Эндпоинт: `GET /api/pfp/reports/:clientId/pdf-url`
- Предпочтительный вариант для интерфейса агента, если не нужен синхронный бинарный ответ
- Уже готовый файл приходит через `status: ready` + `pdf_url`
- Фоновая генерация приходит через `status: processing`

### Пример

`GET /api/pfp/reports/412/pdf?includeCover=1&includeSummary=1&disposition=attachment`

## Сопутствующие JSON-эндпоинты (для экрана перед скачиванием)

- ЛК клиента: `GET /api/my/plan/report`
- ЛК агента: `GET /api/pfp/reports/:clientId`

Они возвращают данные отчёта, на которых строится PDF.

## Поле `comon_showcase` (витрина Comon)

Появляется **только** если у проекта в `projects.settings` включён блок `comon_showcase.enabled: true` (остальные параметры — см. `src/utils/projectComonShowcaseSettings.js`).

Структура успешного ответа:

- `enabled` (boolean) — `true`, если витрина собрана; `false` при гейте (см. `skip_reason`).
- `skip_reason` (string, optional) — например `no_stock_in_plan`: в сводном портфеле нет `product_type: STOCK` (облигации одни не включают блок).
- `generated_at` (string, ISO-8601).
- `disclaimer_ru` (string) — обязательный юридический текст.
- `client_risk_profile_used` (string) — `CONSERVATIVE` \| `BALANCED` \| `AGGRESSIVE`.
- `items` (array) — до `max_items` элементов:
  - `id`, `name`, `url`, `min_sum`, `risk_level`, `profit_365_days_percent`, `annual_average_profit_percent`, `strategy_rating`, `tags`, `author`, `premium`.
- `definitions` (object, optional) — пояснения для UI.

При ошибке загрузки каталога Comon (WAF, сеть): `error: true`, `error_code` (`COMON_FORBIDDEN` \| `COMON_UPSTREAM`), `message`, опционально `comon_http_status`, `items: []`, дисклеймер сохраняется.

Лёгкий эндпоинт без полного отчёта: `GET /api/my/plan/comon-showcase` — тот же контракт или `{ "enabled": false }`, если витрина выключена.

На сводной странице PDF (не тема Rostech) блок печатается внизу страницы, если в payload передан `comon_showcase`.

## Рекомендации фронту

- Для HTML-предпросмотра предпочитать `?format=html`, если не нужен JSON.
- `includePages=1` запрашивать только в debug/export-сценариях, когда реально нужен массив страниц.
- Для тяжёлого отчёта предпочитать `/pdf-url`, а не синхронный `/pdf`.
- Ставить таймаут 60-120 секунд на синхронный PDF.
- На время запроса блокировать кнопку и показывать лоадер.
- Обрабатывать:
  - `401` -> "Сессия истекла"
  - `403` -> "Нет доступа к этому клиенту"
  - `404` -> "Клиент не найден"
  - `500` -> "Не удалось собрать PDF, попробуйте позже"

