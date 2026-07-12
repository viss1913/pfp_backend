# Content Factory — задачи для фронта

**Backend API (Immers test):** `https://pfp-api.bank-future.com/api`  
**OpenAPI:** `openapi/content-factory.yaml`  
**Handoff:** `docs/CONTENT_FACTORY.md`

---

## Общее

| | Admin | Agent LK |
|---|--------|----------|
| Префикс | `/admin/content-factory` | `/pfp/content-factory` |
| Auth | JWT admin + **`x-project-key`** | JWT agent (project из токена) |
| Роль | `admin` / `super_admin` | `agent` |

---

## Admin — фабрика контента

### Экран 1: Библиотека шаблонов

**API:**
- `GET /admin/content-factory/templates`
- `POST /admin/content-factory/templates` — `{ title, html_source, description?, slots?, is_active? }`
- `GET/PUT/DELETE /admin/content-factory/templates/{id}`

**UI:**
- Таблица шаблонов (title, active, updated_at)
- Редактор HTML с подсказкой placeholders: `{{title}}`, `{{body}}`, `{{cta_href}}`, `{{cta_label}}` + ключи из payload оффера
- CTA в шаблоне: `<a data-cta-slot href="{{cta_href}}">{{cta_label}}</a>` (если нет — сервер добавит кнопку)

**Acceptance:**
- [ ] CRUD шаблонов per project (header `x-project-key`)
- [ ] Preview HTML в iframe (sandbox)

---

### Экран 2: Офферы (draft → publish)

**API:**
- `GET /admin/content-factory/offers?status=draft|published|archived`
- `POST /admin/content-factory/offers` — draft
- `PUT/PATCH /admin/content-factory/offers/{id}`
- `POST /admin/content-factory/offers/{id}/generate` — `{ "use_llm": false }`
- `POST .../publish`, `POST .../unpublish`
- `DELETE .../offers/{id}` — archive

**UI:**
- Форма: title, kind, template_id, payload (JSON editor), cta_url_base, cta_label, expires_at
- Кнопки: Generate → Preview generated_html → Publish
- Статусы: draft / published / archived
- Badge «Истекает» если expires_at близко

**Acceptance:**
- [ ] Нельзя publish без generate
- [ ] После publish оффер виден агенту в каталоге
- [ ] Expired офферы уходят в archived при list (lazy)

---

### Экран 3: AI-правки HTML (чат)

**API:**
- `GET /admin/content-factory/offers/{id}/chat/messages`
- `POST .../chat/messages` — `{ "content": "сделай заголовок крупнее" }`

**UI:**
- Split: preview HTML + чат
- Ответ ассистента = обновлённый HTML (полный документ на бэке)
- Ошибка 422 если AI удалил CTA

**Acceptance:**
- [ ] После POST preview обновляется из `offer.generated_html`
- [ ] История сообщений отображается

---

## Agent LK — материалы и презентации

### Экран 1: Каталог офферов

**API:**
- `GET /pfp/content-factory/offers` — только published, не expired
- `GET /pfp/content-factory/offers/{id}`

**UI:**
- Карточки продуктов (title, kind, preview HTML или thumbnail)
- Multi-select для сборки презентации

**Acceptance:**
- [ ] Draft/archived офферы не показываются
- [ ] Expired — 404 на detail

---

### Экран 2: Мои презентации

**API:**
- `GET /pfp/content-factory/presentations`
- `POST /pfp/content-factory/presentations` — `{ title, offer_ids: [1,2], recipient_client_id? }`
- `GET/PATCH /pfp/content-factory/presentations/{id}`

**UI:**
- Список deck'ов (title, status: draft | ready | sent, offer_ids)
- Создание: выбор офферов + название
- PATCH offer_ids — только published (бэк валидирует)

**Acceptance:**
- [ ] Только JWT **агента** (admin без agentId получит 400)
- [ ] Порядок offer_ids = порядок страниц в PDF

---

### Экран 3: PDF + email клиенту

**API:**
- `POST /pfp/content-factory/presentations/{id}/pdf` — JSON `{ pdf_base64, utm_agent }` или `?download=1` → binary PDF
- `POST .../email-draft` — AI subject/body → сохраняет в presentation
- `POST .../send` — `{ "to": "client@mail.ru" }` или email из `recipient_client_id`

**UI:**
- Кнопка «Скачать PDF» (`download=1`)
- «Сгенерировать текст письма» → редактируемые subject/body
- «Отправить клиенту» — выбор клиента из CRM или ручной email

**Acceptance:**
- [ ] В PDF на CTA href есть `utm_agent=` (partner_agent_id или agent id)
- [ ] Send прикрепляет PDF через Resend
- [ ] После send status = `sent`

---

## Smoke для фронта (Immers)

```bash
# Admin
curl -H "Authorization: Bearer $ADMIN_JWT" -H "x-project-key: pk_..." \
  https://pfp-api.bank-future.com/api/admin/content-factory/templates

# Agent
curl -H "Authorization: Bearer $AGENT_JWT" \
  https://pfp-api.bank-future.com/api/pfp/content-factory/offers
```

---

## Out of scope v0.1 (не блокирует старт)

- SSE streaming чата (one-shot JSON)
- Charts из payload → SVG
- R2 для PDF (сейчас base64 / attachment)
- Admin UI для просмотра презентаций агентов
