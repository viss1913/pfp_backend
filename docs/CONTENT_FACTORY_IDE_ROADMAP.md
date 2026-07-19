# Content Factory — интеграция с IDE API



**Статус:** IDE API v1.0 готов на Immers → **интеграция в PFP в работе**.



v0.1 (самодельный CF с payload JSON) **откачен** (`5648e42` revert `3819a7a`).



## Цель



Админка PFP: **чат + preview** как в IDE (`Desktop/IDE`), HTML хранится в PFP, генерация через **IDE Content HTML API**.



## Архитектура



```

Admin UI (чат + preview) → pfp-api → ide-api /v1/content-html → LLM

                              ↓

                         MySQL: offers, ide_session_id, generated_html, chat

                              ↓

                         Agent LK: catalog, PDF, utm_agent, email

```



## Документация



- [integrations/ide-content-html/README.md](./integrations/ide-content-html/README.md) — контракт IDE API

- [FRONT_CONTENT_FACTORY_IDE.md](./FRONT_CONTENT_FACTORY_IDE.md) — задачи для фронта



## Реализация PFP



1. Миграция: `content_offers` (+ `ide_session_id`, `brief`), chat, presentations

2. BFF: `ideContentHtmlClient` + `contentFactoryService`

3. Routes: `/admin/content-factory/*`, `/pfp/content-factory/*`

4. SSE proxy чата → IDE; save `generated_html` на `result`

5. Agent catalog / PDF / utm — Puppeteer + Resend



## Не делать



- Payload JSON как основной UX редактора

- OpenRouter/LLM в PFP для HTML

- iframe IDE как финальное решение

- `content_templates` CRUD в v1

