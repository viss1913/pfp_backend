# Content Factory — задачи для фронта (IDE integration)

Backend BFF готов: `/api/admin/content-factory/*` (admin) и `/api/pfp/content-factory/*` (agent LK).

Контракт: [openapi/content-factory.yaml](../openapi/content-factory.yaml), IDE API: [integrations/ide-content-html/](./integrations/ide-content-html/README.md).

**Задача фронту (picker шаблонов):** см. `Front PFP ver 2/docs/content-factory/ADMIN_TEMPLATE_PICKER_TASK.md` или [FRONT_CONTENT_FACTORY_TEMPLATE_PICKER.md](./FRONT_CONTENT_FACTORY_TEMPLATE_PICKER.md).

---

## Общие требования

- Auth: Bearer JWT + header `x-project-key` (как в остальной админке / ЛК агента).
- Admin: роли `admin`, `super_admin`.
- Agent LK: роли `agent`, `admin`, `super_admin`; для presentations нужен `agentId` в JWT.
- HTML preview **без** `utm_agent` — utm только в PDF агента.

---

## Admin UI — IDE-like (чат + preview)

### Layout

```
+------------------+------------------------+
| Chat (messages)  | Preview (iframe)       |
| + input          | srcDoc=generated_html  |
| + attach media   |                        |
+------------------+------------------------+
| Publish / meta   | CTA fields (href/label)|
+------------------+------------------------+
```

### 1. Список офферов

- `GET /api/admin/content-factory/offers?status=draft|published`
- Фильтр `status=archived` **не используется** — DELETE оффера = hard delete, записи не остаётся.
- Таблица: title, status, published_at, expires_at, updated_at.
- Кнопка «Создать оффер».

### 2. Создание оффера

**Шаг 0 — выбор шаблона (до POST):**

- `GET /api/admin/content-factory/templates`
- Ответ:
  ```json
  {
    "templates": [
      {
        "id": "finam-a4-portrait-light",
        "title": "A4 вертикальный — светлый",
        "orientation": "portrait",
        "theme": "light",
        "preview_url": "/api/admin/content-factory/templates/finam-a4-portrait-light/preview"
      }
    ]
  }
  ```
- Превью в карточке: `GET preview_url` с JWT + `x-project-key` → текст HTML → `<iframe srcDoc={html} sandbox="allow-same-origin" />`
  (не `iframe src` напрямую — нужен Bearer).
- UI: сетка 2×2 (вертик/горизонт × светлый/тёмный), выбранный `id` уходит в create.

- `POST /api/admin/content-factory/offers`
- Body: `{ title, brief?, base_template_id?, page_count?, kind?, cta_url_base?, cta_label?, generate? }`
- `base_template_id` — один из `templates[].id`; default `finam-a4-portrait-light`.
- `page_count` — 1–20 A4-листов в одном HTML; default `1`.
- Если `brief` задан — первый generate через IDE (может занять минуты); показать loader.
- Ответ: `id`, `ide_session_id`, `base_template_id`, `generated_html` — сразу открыть редактор.

### 3. Редактор оффера

- `GET /api/admin/content-factory/offers/:id` — карточка + html.
- Опционально `?sync=1` — подтянуть html из IDE session.
- Preview: `<iframe srcDoc={generated_html} sandbox="allow-same-origin" />`
- PATCH метаданных: `PATCH /api/admin/content-factory/offers/:id` (title, brief, cta_*, expires_at).

### 4. Чат (основной UX правок)

- История: `GET .../offers/:id/chat/messages`
- Отправка с SSE:
  - `POST .../offers/:id/chat/messages?stream=1`
  - Headers: `Accept: text/event-stream`
  - Body: `{ content, attachments? }`
- Парсить SSE events:
  - `progress` — показать статус агентов (orchestrator / site_architect / code_generator)
  - `result` — обновить preview (`html` в data; backend уже сохранил в БД)
  - `error` — toast, не обновлять preview
  - `done` — завершить loader
- Fallback без stream: тот же POST без `stream=1` → JSON `{ offer, messages, preview_html }`.

### 5. Медиа

- Upload: `POST .../offers/:id/media` `{ files: [{ name, content_base64, content_type, kind }] }`
- List: `GET .../offers/:id/media`
- В чате attachments: `{ ref: "media:logo.png", role: "logo", instruction: "..." }`

### 6. Publish

- `POST .../offers/:id/publish` — требует html с `data-cta-slot`.
- `POST .../offers/:id/unpublish` — вернуть в draft.
- `DELETE .../offers/:id` — **удалить оффер навсегда** (не archive).

**Ответ DELETE:** `{ "id": 123, "deleted": true }` — не `ContentOffer`.

На бэке также: чат CASCADE, IDE session delete, оффер убирается из `agent_presentations.offer_ids` (пустая презентация удаляется).

**Фронт:** URL и метод те же (`DELETE`), можно оставить имя `archiveOffer` в `api.ts`, но в UI лучше «Удалить» + confirm. После успеха — убрать строку из списка / `navigate` на список. Убрать таб/фильтр «Архив» и проверки `status === 'archived'` (legacy rows могут ещё быть в БД до ручной чистки).

### 7. Smoke IDE из админки

- `GET /api/admin/content-factory/health/ide` — для диагностики связи с ide-api.

---

## Agent LK — каталог и презентации

Контракт для ЛК: [docs/api/agent_lk.yaml](./api/agent_lk.yaml) (тег **Content Factory**), схемы — [openapi/content-factory.yaml](../openapi/content-factory.yaml).

### 1. Каталог (light list)

- `GET /api/pfp/content-factory/offers` — только `published`, не expired.
- Ответ **без HTML** — поля: `id`, `title`, `kind`, `brief`, `cta_label`, `published_at`, `expires_at`, `base_template_id`, `page_count`.
- Карточки для выбора в deck; для превью — отдельный запрос.

### 2. Превью одного оффера

- `GET /api/pfp/content-factory/offers/:id`
- Ответ: light fields + `cta_url_base` + **`preview_html`** (CTA подставлен, **без utm_agent**).
- `generated_html` агенту **не отдаётся**.
- UI: `<iframe srcDoc={preview_html} sandbox="allow-same-origin" />`

### 3. Презентация (deck)

- `GET/POST /api/pfp/content-factory/presentations`
- `GET/PATCH .../presentations/:id`
- `offer_ids` — **упорядоченный** массив id published офферов; индекс = порядок страниц PDF.
- Ответ содержит **`offers[]`** — те же офферы в порядке `offer_ids`, каждый с `preview_html` для превью слайдов в UI.
- Drag-and-drop на фронте → собрать `offer_ids` → `POST` или `PATCH`.

Пример create:

```json
{
  "title": "Подборка для клиента",
  "offer_ids": [12, 5, 8],
  "recipient_client_id": 456
}
```

### 4. PDF

- `POST .../presentations/:id/pdf` → `{ presentation, pdf_base64, utm_agent, content_type }`
- **`utm_agent`** = `partner_agent_id` агента, если заполнен, иначе `agents.id`.
- Utm добавляется **только** к `<a data-cta-slot>` в PDF — не в preview.
- Скачивание: `?download=1` → raw PDF attachment.
- Preview в UI: blob из `pdf_base64`.

### 5. Email

- `POST .../presentations/:id/email-draft` — шаблон subject/body.
- `POST .../presentations/:id/send` `{ to? }` — PDF (с utm) + Resend; `to` опционально, если задан `recipient_client_id` с email.

---

## Ошибки для UI

| HTTP | Смысл |
|------|--------|
| 422 | CTA slot снесли — показать «верните кнопку CTA» |
| 503 | IDE env не настроен на backend |
| 504 | timeout turn — предложить retry |

---

## Не делать на фронте v1

- Редактор payload JSON
- Прямые вызовы ide-api (только через pfp-api)
- utm в admin preview
