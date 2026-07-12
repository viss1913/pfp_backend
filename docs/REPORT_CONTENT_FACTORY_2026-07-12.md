# Отчёт для тимлида: Content Factory (backend)

**Дата:** 2026-07-12  
**Репо:** `backend PFP`  
**Ветка:** `finam` (локальные изменения)  
**Деплой:** ❌ **не делали** (по ТЗ)

---

## 1. Задача

Фабрика контента для проекта:

- **Админ** загружает HTML-шаблоны, создаёт **предложения** (продукт/оффер: payload, CTA, TTL), генерит HTML, правит через **AI-чат**, **публикует** → каталог агентов.
- **Агент** собирает **презентацию** из 1+ offers → **PDF** с `utm_agent=` на кнопках → email draft (ИИ) / send / save.

Референс генерации/чата: IDE (`Desktop/IDE`), в PFP — упрощённая версия.

---

## 2. Что сделано

### 2.1. БД

Миграция: `database/migrations/20260712120000_create_content_factory_tables.js`

| Таблица | Назначение |
|--------|------------|
| `content_templates` | HTML-библиотека per project |
| `content_offers` | draft/published/archived, payload, generated_html, expires_at |
| `content_offer_chat_messages` | история AI-правок |
| `agent_presentations` | deck агента, offer_ids[], email, pdf snapshot |

### 2.2. API (реализовано)

**Admin** (`restrictTo admin|super_admin`) — `/api/admin/content-factory/...`

| Method | Path |
|--------|------|
| GET/POST | `/templates` |
| GET/PUT/DELETE | `/templates/:id` |
| GET/POST | `/offers` |
| GET/PUT/PATCH/DELETE | `/offers/:id` (DELETE = archive) |
| POST | `/offers/:id/generate` (`use_llm` optional) |
| POST | `/offers/:id/publish`, `/unpublish` |
| GET/POST | `/offers/:id/chat/messages` |

**Agent** — `/api/pfp/content-factory/...`

| Method | Path |
|--------|------|
| GET | `/offers`, `/offers/:id` (published, not expired) |
| GET/POST | `/presentations` |
| GET/PATCH | `/presentations/:id` |
| POST | `/presentations/:id/pdf` (`?download=1` → binary) |
| POST | `/presentations/:id/email-draft` |
| POST | `/presentations/:id/send` |

### 2.3. Логика

- Placeholders `{{key}}` + auto **CTA slot** `data-cta-slot`
- Generate = fill template; optional LLM polish
- AI chat = LLM rewrite HTML, **reject if CTA removed**
- PDF = Puppeteer (`renderHtmlToPdfBuffer`), inject **`utm_agent`**
- Email draft = OpenRouter JSON subject/body; send = Resend attach PDF (dev fallback without key)
- Lazy expire: published + past `expires_at` → archived on list

### 2.4. Файлы

```
src/utils/contentFactoryHtml.js       # pure helpers (fill, CTA, utm)
src/services/contentFactoryService.js
src/controllers/contentFactoryController.js
src/routes/adminContentFactoryRoutes.js
src/routes/agentContentFactoryRoutes.js
src/routes/index.js                    # wired
openapi/content-factory.yaml
docs/CONTENT_FACTORY.md
test/contentFactoryUtil.test.js        # 6 tests, passed
docs/REPORT_CONTENT_FACTORY_2026-07-12.md  # this file
```

### 2.5. Тесты

```bash
npx jest test/contentFactoryUtil.test.js
# 6 passed (fill, CTA, utm order, replace utm)
```

Миграцию на стенде: `npx knex migrate:latest` — **локально**, не prod.

---

## 3. Что не сделано / out of scope

- ❌ Deploy Immers / prod  
- ❌ Admin UI / Agent UI (front)  
- ❌ Полный merge paths в монолитный `OPENAPI_SPEC.yaml` (отдельный `content-factory.yaml`)  
- ❌ Object storage для PDF (отдаём base64 / attachment)  
- ❌ SSE streaming chat как в IDE (JSON one-shot)  
- ❌ Charts renderer (payload.chart → SVG) — payload JSON only  
- ❌ Push remote (если не попросили)

---

## 4. Как проверить (без деплоя)

1. `npx knex migrate:latest` на dev DB  
2. JWT admin + `x-project-key`  
3. Template → offer → generate → publish  
4. JWT agent → list offers → presentation → pdf  
5. Network: CTA href содержит `utm_agent=`

Пример generate body: `{ "use_llm": false }`

---

## 5. Риски / решения по умолчанию

| Вопрос | Решение v0.1 |
|--------|----------------|
| utm name | `utm_agent` |
| templates scope | per `project_id` |
| offer shape | 1 HTML page |
| expired | soft `archived` |
| HTML storage | DB `text` |

---

## 6. Просьба к тимлиду

1. Ревью API/модели  
2. Ок на merge в `finam`  
3. Deploy — **отдельным** решением  
4. Front handoff: `docs/CONTENT_FACTORY.md` + `openapi/content-factory.yaml`

---

## 7. TL;DR

На бэке **локально** поднята **Content Factory**: admin templates/offers/generate/AI-chat/publish + agent catalog/presentation/PDF/email. CTA с `utm_agent`. **Деплоя нет.** Документы и unit-тесты helpers — для ревью.
