# Content HTML API — контракт для PFP

**Версия API:** 1.1.0  
**Сервис:** IDE `ide-api` (Immers)  
**Потребитель:** `pfp-api` (server-to-server)  
**Дата:** 2026-07-14

PDF, email, utm, каталог агентов — **только PFP**. IDE отдаёт **HTML** (чат + медиа + агенты).

### Команда агентов (синхрон с product IDE)

Turn (`POST .../messages` / generate) использует **те же heuristics**, что SPA:

| Интент | Pipeline |
|--------|----------|
| Правка текста/стиля | БА → Программист |
| «нарисуй / добавь картинку…» | **БА → Художник → БА → Программист** |
| User media (`assets/user/*`) без «нарисуй» | БА → Программист (без художника) |

Художник пишет в **папку сессии** (`assets/hero.png`…), не в product S3.  
Перед ответом картинки **инлайнятся** в HTML (data-URI) для PDF.  
Publish сайта IDE **не** вызывается.

---

## 1. Base URL

| Окружение | Base URL |
|-----------|----------|
| **Prod (Immers, сейчас)** | `https://195-209-220-250.sslip.io` |
| Prod (когда DNS) | `https://ide-api.bank-future.com` |
| Local | `http://localhost:3010` |

**Префикс всех методов:** `/v1/content-html`

Пример: `POST https://195-209-220-250.sslip.io/v1/content-html/sessions`

---

## 2. Auth (обязательно)

```http
Authorization: Bearer <IDE_CONTENT_FACTORY_SERVICE_KEY>
```

или

```http
X-IDE-Service-Key: <IDE_CONTENT_FACTORY_SERVICE_KEY>
```

| Ситуация | HTTP | body |
|----------|------|------|
| Нет ключа | 401 | `{"error":"auth_required","message":"Missing service key"}` |
| Неверный ключ | 403 | `{"error":"invalid_service_key"}` |
| Ключ не настроен на сервере | 503 | `{"error":"service_key_not_configured",...}` |

**Не** использовать user JWT / cookie SPA IDE.

Ключ для prod выдан команде IDE → см. `docs/PFP_CONTENT_HTML_HANDOFF.md` (секция «Доступы»).

---

## 3. Endpoints (сводка)

| Method | Path | Описание |
|--------|------|----------|
| GET | `/v1/content-html/health` | health CF |
| GET | `/v1/content-html/templates` | список base-шаблонов (dropdown) |
| GET | `/v1/content-html/templates/{id}` | метаданные шаблона |
| GET | `/v1/content-html/templates/{id}/html` | HTML шаблона (preview без сессии) |
| POST | `/v1/content-html/sessions` | создать сессию |
| GET | `/v1/content-html/sessions/{id}` | html + media |
| DELETE | `/v1/content-html/sessions/{id}` | удалить сессию |
| POST | `/v1/content-html/sessions/{id}/media` | upload файлов |
| GET | `/v1/content-html/sessions/{id}/media` | список media |
| DELETE | `/v1/content-html/sessions/{id}/media/{ref}` | удалить файл |
| POST | `/v1/content-html/sessions/{id}/messages` | чат → новый HTML |
| POST | `/v1/content-html/generate` | one-shot generate |

`Content-Type: application/json`  
Лимит body: до **32 MB** (base64 media).

---

## 4. GET `/health`

```bash
curl -sS -H "Authorization: Bearer $IDE_KEY" \
  "$IDE_API/v1/content-html/health"
```

**200:**

```json
{
  "ok": true,
  "service": "ide-content-html",
  "version": "1.1.0",
  "llm": "configured",
  "grokTerminal": true
}
```

---

## 4.1 GET `/templates`

Список корпоративных base-шаблонов (для dropdown в админке PFP).

```bash
curl -sS -H "Authorization: Bearer $IDE_KEY" \
  "$IDE_API/v1/content-html/templates"
```

**200:**

```json
{
  "templates": [
    {
      "id": "finam-a4-portrait-light",
      "title": "Finam A4 — вертикальный, светлый",
      "orientation": "portrait",
      "theme": "light",
      "format": "a4",
      "page_size": "210x297mm",
      "brand": "finam",
      "preview_thumbnail_url": null
    }
  ]
}
```

| id | orientation | theme |
|----|-------------|-------|
| `finam-a4-portrait-light` | portrait | light |
| `finam-a4-portrait-dark` | portrait | dark |
| `finam-a4-landscape-light` | landscape | light |
| `finam-a4-landscape-dark` | landscape | dark |

- `GET /templates/{id}` — только meta  
- `GET /templates/{id}/html` — `{ id, title, orientation, theme, html }` для preview  

Неизвестный id → **404/400** `{ "error": "unknown_template", "known_templates": [...] }`.

---

## 5. POST `/sessions`

Создать сессию редактирования одного HTML-документа.

### Request

```json
{
  "title": "Оффер: Подушка безопасности",
  "brief": "Одна страница A4, продукт НСЖ, CTA внизу",
  "initial_html": null,
  "constraints": {
    "base_template_id": "finam-a4-portrait-light",
    "page_count": 1,
    "preserve_template_chrome": true,
    "preserve_attributes": ["data-cta-slot"],
    "language": "ru"
  },
  "external_ref": "pfp-offer-123",
  "generate": true
}
```

**Мультистраничный пример (2 листа A4 в одном HTML):**

```json
{
  "title": "Брошюра НСЖ",
  "brief": "Две страницы: обложка + условия",
  "generate": true,
  "constraints": {
    "base_template_id": "finam-a4-landscape-dark",
    "page_count": 2,
    "preserve_template_chrome": true,
    "preserve_attributes": ["data-cta-slot"]
  }
}
```

| Поле | Обяз. | Описание |
|------|-------|----------|
| `title` | нет | для логов |
| `brief` | нет | контекст / первый generate |
| `initial_html` | нет | стартовый HTML (**приоритет** над `base_template_id`) |
| `constraints` | нет | см. § Constraints |
| `external_ref` | нет | id оффера PFP |
| `generate` | нет | default **true**: если есть `brief` и нет `initial_html` — сразу turn (та же команда агентов, что IDE). `false` — только шаблон |

### Response 201

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "html": "<!DOCTYPE html>...",
  "assistant_message": "Сессия создана. …",
  "validation": { "cta_slot_present": true },
  "created_at": "2026-07-12T12:00:00.000Z"
}
```

`validation` есть, если отработал generate.

TTL сессии: **7 дней** (потом `status=deleted`).

---

## 6. GET `/sessions/{session_id}`

### Response 200

```json
{
  "session_id": "...",
  "html": "<!DOCTYPE html>...",
  "title": "...",
  "brief": "...",
  "external_ref": "pfp-offer-123",
  "constraints": { "preserve_attributes": ["data-cta-slot"], "language": "ru" },
  "media": [
    {
      "ref": "media:logo.png",
      "path": "assets/user/logo.png",
      "name": "logo.png",
      "content_type": "image/png",
      "kind": "logo",
      "size_bytes": 12400
    }
  ],
  "updated_at": "...",
  "expires_at": "..."
}
```

404: `{"error":"not_found"}`

---

## 7. DELETE `/sessions/{session_id}`

```json
{ "ok": true }
```

Удаляет запись + файлы на диске IDE.

---

## 8. POST `/sessions/{id}/media`

Upload base64 (как IDE project media).

### Request

```json
{
  "files": [
    {
      "name": "logo.png",
      "content_base64": "iVBORw0KGgo...",
      "content_type": "image/png",
      "kind": "logo"
    },
    {
      "name": "chart-data.json",
      "content_base64": "eyJsYWJlbHMi...",
      "content_type": "application/json",
      "kind": "chart_data"
    }
  ]
}
```

Допускается camelCase: `contentBase64`, `contentType`.

| kind (подсказка агентам) | |
|--------------------------|--|
| `logo` \| `hero` \| `icon` \| `chart_data` \| `text` \| `other` | |

**Типы:** png, jpeg, webp, gif, svg, txt, md, csv, json.  
**Лимиты:** ≤ 8 файлов; image ≤ 8 MB; json/txt ≤ 256 KB; сумма на сессию ≤ 32 MB.

### Response 201

```json
{
  "ok": true,
  "files": [
    {
      "ref": "media:logo.png",
      "path": "assets/user/logo.png",
      "name": "logo.png",
      "content_type": "image/png",
      "size_bytes": 12400,
      "kind": "logo"
    }
  ],
  "note": "Файлы доступны агентам. Укажите attachments в POST .../messages или опишите в content."
}
```

---

## 9. POST `/sessions/{id}/messages` — основной turn

Обновляет HTML по тексту + опционально media.

### Query / headers для stream

- `?stream=1` **или**
- `Accept: text/event-stream`

### Request

```json
{
  "content": "Сделай заголовок крупнее, логотип в шапку, график из chart-data.json",
  "current_html": null,
  "attachments": [
    {
      "ref": "media:logo.png",
      "role": "logo",
      "instruction": "Поставь в шапку слева"
    },
    {
      "ref": "media:chart-data.json",
      "role": "chart_data",
      "instruction": "Построй bar-chart SVG"
    }
  ],
  "files": []
}
```

| Поле | Описание |
|------|----------|
| `content` | обязательный текст (1…8000) |
| `current_html` | опционально: перезаписать HTML сессии перед turn |
| `attachments` | ссылки на уже загруженные `ref` + инструкции |
| `files` | можно upload + message в одном запросе (тот же формат, что media) |

### Response JSON 200

```json
{
  "session_id": "...",
  "html": "<!DOCTYPE html>...полный документ...",
  "assistant_message": "Заголовок увеличил, логотип в шапке, добавил SVG-график.",
  "validation": {
    "cta_slot_present": true
  }
}
```

### Response SSE

```
event: hello
data: {"ok":true}

event: progress
data: {"agent":"site_architect","stage":"running","message":"Формулирую задачу…","status":"running","detail":"..."}

event: progress
data: {"agent":"code_generator","stage":"running","message":"Пишу HTML…","status":"running"}

event: result
data: {"session_id":"...","html":"<!DOCTYPE html>...","assistant_message":"...","validation":{"cta_slot_present":true}}

event: done
data: {"ok":true}
```

Ошибка:

```
event: error
data: {"error":"cta_slot_removed","message":"...","validation":{...}}
```

### 422 — пропал CTA

```json
{
  "error": "cta_slot_removed",
  "message": "Required data-cta-slot is missing from HTML",
  "validation": { "cta_slot_present": false, "ok": false }
}
```

PFP должен **не** сохранять такой HTML в publish без слота (или откатить).

---

## 10. POST `/generate` (one-shot)

Без предварительной сессии (внутри создаётся ephemeral session).

```json
{
  "brief": "Одна страница A4, продукт НСЖ, спокойный стиль, кнопка CTA",
  "current_html": null,
  "title": "НСЖ",
  "constraints": {
    "single_page": true,
    "preserve_attributes": ["data-cta-slot"],
    "language": "ru"
  }
}
```

**200:**

```json
{
  "session_id": "...",
  "html": "<!DOCTYPE html>...",
  "assistant_message": "...",
  "validation": { "cta_slot_present": true }
}
```

Поддерживает SSE (`?stream=1`).

Turn может длиться **до ~2–10 мин** (БА + Grok/LLM). Для UI админки используйте stream.

---

## 11. Constraints

| Поле | Тип | Описание |
|------|-----|----------|
| `base_template_id` | string | id шаблона из `GET /templates` (напр. `finam-a4-portrait-light`) |
| `page_count` | int 1–20 | сколько **A4-страниц** верстать в одном HTML. Default **1** |
| `single_page` | bool | legacy: `true` ≈ `page_count: 1`; `false` без `page_count` — агент сам решит N |
| `format_hint` | string | `a4_print` (общее) **или** alias шаблона (см. ниже) |
| `preserve_template_chrome` | bool | default `true` если задан `base_template_id`: не ломать header/footer/logo/`@page` |
| `preserve_attributes` | string[] | **не удалять** CTA-слот: `["data-cta-slot"]` |
| `language` | string | `ru` / `en` |

### Приоритет стартового HTML

1. `initial_html` (если не пустой) — **всегда побеждает**
2. иначе `constraints.base_template_id` → файл из каталога шаблонов
3. иначе `format_hint` alias → тот же каталог
4. иначе встроенный дефолт IDE (generic A4)

Неизвестный `base_template_id` → **400**:

```json
{
  "error": "unknown_template",
  "message": "Unknown base_template_id: …",
  "known_templates": [
    "finam-a4-portrait-light",
    "finam-a4-portrait-dark",
    "finam-a4-landscape-light",
    "finam-a4-landscape-dark"
  ]
}
```

### `format_hint` aliases (если id не передан)

| `format_hint` | → `base_template_id` |
|---------------|----------------------|
| `a4_portrait_light` | `finam-a4-portrait-light` |
| `a4_portrait_dark` | `finam-a4-portrait-dark` |
| `a4_landscape_light` | `finam-a4-landscape-light` |
| `a4_landscape_dark` | `finam-a4-landscape-dark` |
| `a4_print` | без шаблона Finam (generic seed) |

### `page_count` (мультистраничность)

- `page_count: 1` — один `<article class="sheet">` (или `.page`)
- `page_count: N` — N листов с `data-page="1..N"`, CSS `page-break-after`, CTA на **последней** странице
- Один HTTP-ответ / один `index.html` — Puppeteer PFP печатает весь документ в multi-page PDF
- Агенты на каждом turn получают `page_count` в constraints prompt

### CTA placeholder (PFP подставит href/label)

```html
<a data-cta-slot href="#">{{cta_label}}</a>
```

### HTML для Puppeteer

> **Полный контракт (обязательно для IDE):** [PDF_HTML_REQUIREMENTS.md](./PDF_HTML_REQUIREMENTS.md)

- CSS в `<style>` (self-contained)
- Картинки после turn **должны** быть инлайн `data:image/...;base64,...` — без `__CF_DATA_URI` и `assets/`
- Графики — **inline SVG** / HTML-таблица (без внешних CDN)
- Finam-шаблоны: подвал «ООО «Финам»», лого inline base64, `data-cta-slot`

---

## 12. Рекомендуемый flow PFP BFF

```
0. GET /templates  → dropdown «вертикальный светлый / …»
   (или закэшировать 4 id на PFP)

1. POST /sessions  {
     title, brief, external_ref, generate: true,
     constraints: {
       base_template_id: "finam-a4-portrait-light",
       page_count: 1,            // или 2+ для брошюры
       preserve_template_chrome: true,
       preserve_attributes: ["data-cta-slot"]
     }
   }
   → session_id, html  → сохранить в MySQL offers.generated_html

2. (опционально) POST /sessions/{id}/media  { files: [logo, chart json] }

3. POST /sessions/{id}/messages?stream=1
   { content, attachments }
   → progress в админку
   → result.html → overwrite generated_html

4. Админ Publish → каталог агентов (PFP)

5. Агент → Puppeteer(HTML) → PDF + utm (PFP)
```

**Не** ходите в `/projects` / `/chats` IDE — только `/v1/content-html`.

---

## 13. Smoke curl

```bash
export IDE_API="https://195-209-220-250.sslip.io"
export IDE_KEY="<см. handoff>"

# health
curl -sS -H "Authorization: Bearer $IDE_KEY" "$IDE_API/v1/content-html/health"

# session (шаблон, без long generate)
curl -sS -X POST "$IDE_API/v1/content-html/sessions" \
  -H "Authorization: Bearer $IDE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"smoke","generate":false,"constraints":{"preserve_attributes":["data-cta-slot"]}}'

# one-shot (долго: LLM/Grok)
curl -sS -X POST "$IDE_API/v1/content-html/generate" \
  -H "Authorization: Bearer $IDE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"brief":"A4 лендинг, data-cta-slot внизу","constraints":{"preserve_attributes":["data-cta-slot"],"language":"ru"}}'
```

---

## 14. Ошибки (общие)

| error | HTTP |
|-------|------|
| `auth_required` | 401 |
| `invalid_service_key` | 403 |
| `service_key_not_configured` | 503 |
| `not_found` | 404 |
| `validation` | 400 |
| `cta_slot_removed` | 422 |
| `too_large` / `bad_type` / `empty` | 400 |
| `internal` | 500 |

---

## 15. Изоляция от IDE SPA

| IDE продукт (не трогать) | Content HTML (этот API) |
|--------------------------|-------------------------|
| `/projects`, `/chats` + user JWT | `/v1/content-html` + service key |
| Yandex publish сайтов | нет publish |
| Postgres `projects` | `content_html_sessions` |
| S3 site buckets | локально `CONTENT_HTML_ROOT` |

---

## 16. Связанные документы

| Файл | Для кого |
|------|----------|
| **`docs/CONTENT_HTML_API.md`** (этот) | Контракт API |
| **`docs/PFP_CONTENT_HTML_HANDOFF.md`** | Интеграция, доступы, checklist |
| `docs/IDE_CONTENT_HTML_API_TASK.md` | Полная постановка (зачем / PDF) |
