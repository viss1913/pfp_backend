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

### Query-параметры

- `includeCover=1|0` (по умолчанию `1`)
- `includeSummary=1|0` (по умолчанию `1`)
- `goalTypes=PENSION,LIFE,INVESTMENT,OTHER,FIN_RESERVE` (опционально, CSV)
- `disposition=attachment` (если нужно принудительное скачивание)

### Пример

`GET /api/my/plan/report/pdf?includeCover=1&includeSummary=1&disposition=attachment`

## ЛК агента

- Эндпоинт: `GET /api/pfp/reports/:clientId/pdf`
- Доступ только к клиентам агента (проверка `client.agent_id === req.user.agentId`).
- Для `admin/super_admin` доступ разрешён по проекту.

### Query-параметры

- `includeCover=1|0`
- `includeSummary=1|0`
- `goalTypes=...` (CSV)
- `disposition=attachment`

### Пример

`GET /api/pfp/reports/412/pdf?includeCover=1&includeSummary=1&disposition=attachment`

## Сопутствующие JSON-эндпоинты (для экрана перед скачиванием)

- ЛК клиента: `GET /api/my/plan/report`
- ЛК агента: `GET /api/pfp/reports/:clientId`

Они возвращают данные отчёта, на которых строится PDF.

## Рекомендации фронту

- Ставить таймаут 60-120 секунд на PDF.
- На время запроса блокировать кнопку и показывать лоадер.
- Обрабатывать:
  - `401` -> "Сессия истекла"
  - `403` -> "Нет доступа к этому клиенту"
  - `404` -> "Клиент не найден"
  - `500` -> "Не удалось собрать PDF, попробуйте позже"

