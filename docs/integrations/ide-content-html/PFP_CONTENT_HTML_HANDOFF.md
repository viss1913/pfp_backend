# Handoff для программиста PFP: Content HTML API (IDE)

**От:** IDE API (Immers)  
**Кому:** backend / BFF PFP  
**Дата:** 2026-07-14  
**Статус:** API **v1.1** **задеплоен** на Immers (шаблоны Finam + `page_count`)

Полный HTTP-контракт: **`docs/CONTENT_HTML_API.md`**.  
Бизнес-контекст и PDF: **`docs/IDE_CONTENT_HTML_API_TASK.md`**.  
Старт-пакет: **`docs/README_PFP_CONTENT.md`**.

---

## 1. Зачем (30 секунд)

| Кто | Делает |
|-----|--------|
| **IDE** (`ide-api`) | Чат + медиа + **та же команда агентов**, что SPA (БА / Художник / Программист) → **готовый HTML** (A4 / print) |
| **PFP** | MySQL, publish в каталог, **Puppeteer → PDF**, email, **utm_agent** |

```
Админка PFP  →  pfp-api  →  ide-api /v1/content-html  →  HTML
                                ↑
                         service key
                     (не user JWT IDE)

Агент ЛК  →  pfp-api: HTML → Puppeteer → PDF → email / download
```

**IDE не делает PDF и не шлёт письма.**

---

## 2. Доступы (prod Immers)

| Параметр | Значение |
|----------|----------|
| **Base URL** | `https://195-209-220-250.sslip.io` |
| **API prefix** | `/v1/content-html` |
| **Service key** | выдаётся командой IDE — **не хранить в git** |
| **Auth header** | `Authorization: Bearer <key>` **или** `X-IDE-Service-Key: <key>` |
| **Timeout turn** | до **120–600 с** (Grok/LLM) — в UI stream |

Env для `pfp-api` (рекомендация):

```env
IDE_CONTENT_HTML_BASE_URL=https://195-209-220-250.sslip.io
IDE_CONTENT_FACTORY_SERVICE_KEY=<секрет из команды IDE>
```

> Ключ можно сменить на стороне IDE (`/opt/ide-api/.env` + `systemctl restart ide-api`). После смены — обновить PFP.

Когда поднимут DNS: `https://ide-api.bank-future.com` (тот же сервис).

---

## 3. Минимальный happy-path (BFF)

```ts
// 0) Список шаблонов для dropdown в админке (кэшируйте)
// GET /v1/content-html/templates → { templates: [{ id, title, orientation, theme, ... }] }
// ids: finam-a4-portrait-light | portrait-dark | landscape-light | landscape-dark

// 1) Сессия + первый черновик по brief (долго, если generate=true)
const s = await fetch(`${IDE}/v1/content-html/sessions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: offer.title,
    brief: offer.briefForIde,
    external_ref: `pfp-offer-${offer.id}`,
    generate: true, // false = сразу HTML шаблона без LLM
    constraints: {
      base_template_id: offer.templateId || 'finam-a4-portrait-light',
      page_count: offer.pageCount || 1, // 1–20 A4-листов в одном HTML
      preserve_template_chrome: true, // не ломать header/footer/logo
      preserve_attributes: ['data-cta-slot'],
      language: 'ru',
    },
  }),
}).then((r) => r.json());

// s.session_id, s.html  →  сохранить в MySQL

// 2) Медиа (логотип / JSON графика)
await fetch(`${IDE}/v1/content-html/sessions/${s.session_id}/media`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    files: [
      {
        name: 'logo.png',
        content_base64: logoBase64,
        content_type: 'image/png',
        kind: 'logo',
      },
    ],
  }),
});

// 3) Правка в чате (лучше SSE для progress в админке)
const turn = await fetch(
  `${IDE}/v1/content-html/sessions/${s.session_id}/messages?stream=1`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      content: 'Логотип в шапку, спокойный стиль, CTA внизу',
      attachments: [
        { ref: 'media:logo.png', role: 'logo', instruction: 'header left' },
      ],
    }),
  },
);
// парсить SSE: progress → result.html → сохранить generated_html

// 4) Publish / PDF — только PFP
// - подставить href на <a data-cta-slot>
// - добавить utm_agent при выдаче PDF
// - renderHtmlToPdfBuffer(html)
```

---

## 4. Что проверить в HTML перед PDF

1. Есть **`data-cta-slot`** (иначе IDE вернёт 422 на turn, если слот снесли).  
2. Стили **inline / в `<style>`** — без внешних CDN.  
3. Картинки часто уже **`data:image/...;base64`** (IDE инлайнит после turn).  
4. Размер HTML разумный (лимит ~512 KB на стороне IDE).

Placeholder CTA:

```html
<a data-cta-slot href="#">{{cta_label}}</a>
```

PFP при save/publish подставляет реальный `href` и label; при PDF — `utm_agent=…`.

---

## 5. SSE (progress для админки)

События:

| event | data |
|-------|------|
| `hello` | `{"ok":true}` |
| `progress` | `{ agent, stage/status, message/detail, label? }` |
| `result` | `{ session_id, html, assistant_message, validation }` |
| `done` | `{"ok":true}` |
| `error` | `{ error, message, validation? }` |

Агенты (для UI-лейблов): `orchestrator` / `site_architect` / `code_generator` (Планировщик → БА → Программист).

---

## 6. Checklist интеграции PFP

- [ ] Env: `IDE_CONTENT_HTML_BASE_URL` + `IDE_CONTENT_FACTORY_SERVICE_KEY`  
- [ ] `GET .../health` → 200 с ключом, 401 без  
- [ ] `GET .../templates` → 4 Finam id для dropdown  
- [ ] `POST .../sessions` с `base_template_id` + `page_count`, `generate:false` → Finam HTML + CTA  
- [ ] Неизвестный `base_template_id` → 400 `unknown_template` + `known_templates`  
- [ ] `POST .../media` logo + json  
- [ ] `POST .../messages` → html обновился, CTA на месте  
- [ ] Сохранить `html` + `ide_session_id` (+ template_id, page_count) в MySQL  
- [ ] Preview iframe `srcDoc={html}` в админке  
- [ ] Publish → каталог; PDF через существующий Puppeteer (multi-page = multi sheet в одном HTML)  
- [ ] utm на CTA **после** IDE, на стороне PFP  

**Не вызывать:** `/projects`, `/chats`, user login IDE.

---

## 7. Ограничения v1.1

| | |
|--|--|
| Один HTML-файл на сессию | да (внутри может быть N A4-листов) |
| `page_count` 1–20 | да — несколько `article.sheet` + page-break |
| Корп. шаблоны Finam | 4 id, файлы на IDE; правки в git, не CRUD |
| Publish Yandex из CF | нет |
| Video / zip | нет |
| История чата в IDE | опционально; PFP может хранить у себя |
| Turn time | LLM/Grok — **долго**; stream обязателен для UX |

---

## 8. Быстрый smoke (скопировать)

```bash
export IDE_API="https://195-209-220-250.sslip.io"
export IDE_KEY="<секрет из команды IDE>"

curl -sS -H "Authorization: Bearer $IDE_KEY" "$IDE_API/v1/content-html/health"
# → {"ok":true,"service":"ide-content-html","version":"1.1.0",...}

curl -sS -H "Authorization: Bearer $IDE_KEY" "$IDE_API/v1/content-html/templates"
# → 4 Finam templates

curl -sS -X POST "$IDE_API/v1/content-html/sessions" \
  -H "Authorization: Bearer $IDE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"pfp-smoke","generate":false,"constraints":{"base_template_id":"finam-a4-portrait-light","page_count":1,"preserve_attributes":["data-cta-slot"]}}'
# → session_id + Finam html with data-cta-slot
```

---

## 9. Контакты / вопросы

| | |
|--|--|
| API / Immers IDE | команда IDE |
| Контракт | правки в `CONTENT_HTML_API.md` |
| Продукт / PDF / offers | PFP (Саша + backend) |

При расхождении контракта — сначала обновить MD в `Desktop/IDE/docs/`, потом код.
