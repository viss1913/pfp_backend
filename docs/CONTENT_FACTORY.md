# Content Factory (фабрика контента)

**Спека API:** `openapi/content-factory.yaml`  
**Код:** `src/services/contentFactoryService.js`, `src/controllers/contentFactoryController.js`  
**Роуты:** `/admin/content-factory/*`, `/pfp/content-factory/*`  
**Миграция:** `database/migrations/20260712120000_create_content_factory_tables.js`

## Роли

| Роль | Префикс |
|------|---------|
| admin / super_admin | `/admin/content-factory` |
| agent (+ admin) | `/pfp/content-factory` |

Все запросы: JWT + tenant (`x-project-key` для admin).

## CTA и utm_agent

- В шаблоне: `<a data-cta-slot href="{{cta_href}}">{{cta_label}}</a>`
- Если слота нет — сервер **добавляет** кнопку при save/generate.
- AI-чат **не может** удалить `data-cta-slot` (422).
- При PDF агента: в href CTA добавляется **`utm_agent=`** = `agents.partner_agent_id` или `agent_id`.

## Placeholders

В `html_source`: `{{title}}`, `{{body}}`, `{{cta_href}}`, `{{cta_label}}` + любые ключи из `offer.payload`.

## Admin flow

1. POST `/admin/content-factory/templates` — HTML
2. POST `/admin/content-factory/offers` — draft + template_id + payload + cta + expires_at
3. POST `/admin/content-factory/offers/{id}/generate` — fill (optional `{ "use_llm": true }`)
4. POST `.../chat/messages` — AI правки HTML
5. POST `.../publish` — в каталог агентов

## Agent flow

1. GET `/pfp/content-factory/offers` — published & not expired
2. POST `/pfp/content-factory/presentations` — `{ offer_ids: [1,2], title }`
3. POST `.../presentations/{id}/pdf` — PDF (+ `?download=1`)
4. POST `.../email-draft` — AI subject/body
5. POST `.../send` — `{ "to": "..." }` или recipient_client_id

## TTL

`expires_at` — lazy archive published → archived при list (admin/agent).

## Референс IDE

`C:\Users\User\Desktop\IDE` — идея chat+HTML tools; в PFP упрощённый one-shot LLM edit.

## Deploy

**Immers test:** `https://pfp-api.bank-future.com/api` — после `npx knex migrate:latest` на VM.

Задачи для фронта: **`docs/FRONT_CONTENT_FACTORY_TASKS.md`**.

**Не деплоить prod** без явного решения тимлида.
