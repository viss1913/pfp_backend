# Content Factory: Comon URL → IDE HTML

**Кому:** backend PFP  
**От:** IDE / Content Factory  
**Дата:** 2026-07-23  
**Статус:** IDE ingest + шаблоны Finam готовы — нужна BFF-склейка

---

## Схема

```
Админ вставил URL стратегии Comon
  → pfp-api: parse id + fetch через comonService
  → pfp-api: POST ide-api /v1/content-html/sessions
       (source_url + source_payload + constraints)
  → IDE: brief из payload → generate → html
  → pfp: сохранить session_id + html → PDF / publish у себя
```

| Кто | Делает |
|-----|--------|
| **PFP** | Comon (уже есть), BFF, MySQL, PDF, email, utm на CTA |
| **IDE** | brief из payload, сессия, шаблоны Finam, генерация HTML, чат-правки |

---

## Env

```env
IDE_CONTENT_HTML_BASE_URL=https://195-209-220-250.sslip.io
IDE_CONTENT_FACTORY_SERVICE_KEY=<см. handoff IDE / секреты команды>
```

Каждый запрос к IDE:

```http
Authorization: Bearer <IDE_CONTENT_FACTORY_SERVICE_KEY>
Content-Type: application/json
```

Альтернатива: заголовок `X-IDE-Service-Key: <тот же ключ>`.

Префикс: `/v1/content-html`  
Timeout generate: до ~10 минут (в UI удобнее SSE на messages).

Smoke:

```bash
curl -sS -H "Authorization: Bearer $IDE_KEY" \
  "$IDE_API/v1/content-html/health"
```

---

## Шаг 1 — данные Comon (у вас уже есть)

1. Разобрать URL → id: `parseStrategyUrlToId` / `resolveStrategyLink`.
2. Забрать карточку стратегии любым рабочим путём:
   - предпочтительно полный JSON API: `GET /api/v1/strategies/{id}` (тело целиком → `source_payload`);
   - либо `getNormalizedStrategyDetails(id)` → `{ strategyId, fields, pageUrl }`  
     (IDE понимает оба формата; в `fields` достаточно `id` + `name` + KPI).

Существующие ручки:

- `GET /api/pfp/comon/strategies/:id`
- `GET /api/pfp/comon/strategies/:id/details`
- `POST /api/pfp/comon/resolve` (url → id)

---

## Шаг 2 — создать сессию + генерацию на IDE

`POST {IDE_CONTENT_HTML_BASE_URL}/v1/content-html/sessions`

```json
{
  "source_url": "https://www.comon.ru/strategies/120733/",
  "source_payload": {},
  "generate": true,
  "external_ref": "pfp-offer-<ваш_id>",
  "constraints": {
    "base_template_id": "finam-a4-portrait-light",
    "page_count": 2,
    "preserve_template_chrome": true,
    "source_url": "https://www.comon.ru/strategies/120733/"
  }
}
```

| Поле | Нужно | Коммент |
|------|-------|---------|
| `source_payload` | да | ответ Comon / details |
| `source_url` | да | CTA + brief |
| `constraints.base_template_id` | да | см. шаблоны ниже |
| `constraints.page_count` | да | 1…20; для оффера по умолчанию **2** |
| `generate` | да | `true` → HTML сразу в ответе |
| `brief` | нет | IDE соберёт сам из payload |
| `external_ref` | опц. | ваш id оффера |

**Ответ 201:**

```json
{
  "session_id": "uuid",
  "html": "<!DOCTYPE html>...",
  "brief": "...",
  "assistant_message": "...",
  "constraints": {},
  "source": {
    "fetch_status": "payload",
    "facts": {}
  }
}
```

Сохранить у себя минимум: `ide_session_id`, `generated_html`, `base_template_id`, `page_count`.

---

## Шаг 3 (опц.) — только brief, без сессии

`POST /v1/content-html/ingest`

```json
{
  "source_url": "https://www.comon.ru/strategies/120733/",
  "source_payload": {},
  "page_count": 2,
  "theme": "light"
}
```

→ `{ brief, facts, suggested_constraints }` — удобно для UI «проверить цифры» до generate.

---

## Шаг 4 — правки после генерации

`POST /v1/content-html/sessions/{session_id}/messages?stream=1`

```json
{ "content": "увеличь KPI, CTA не трогай" }
```

→ SSE в админку.

Медиа: `POST /v1/content-html/sessions/{id}/media` (multipart).

---

## Шаг 5 — PDF / email / utm

Только на стороне PFP. Перед PDF: CTA / `data-cta-slot` → дописать `utm_agent` и т.п.

---

## Предлагаемая BFF-ручка

`POST /api/pfp/content-factory/from-comon`

```json
{
  "url": "https://www.comon.ru/strategies/120733/",
  "template_id": "finam-a4-portrait-light",
  "page_count": 2
}
```

Внутри:

1. `resolveStrategyLink(url)` → id  
2. fetch Comon (`comonService`)  
3. `POST IDE .../sessions` (тело выше)  
4. вернуть админке `{ session_id, html, brief, facts }`

Клиент IDE (если ещё нет): один модуль `IdeContentHtmlClient` — `health`, `listTemplates`, `createSession`, `getSession`, `uploadMedia`, `sendMessage({ stream })`.

Не ходить в `/projects` / `/chats` IDE — только `/v1/content-html/*` + service key.

---

## Шаблоны (`base_template_id`)

| id | Когда |
|----|--------|
| `finam-a4-portrait-light` | **дефолт** оффер A4 светлый |
| `finam-a4-portrait-dark` | тёмный |
| `finam-a4-landscape-light` / `-dark` | альбом |
| `finam-flyer-portrait-light` / `-dark` | flyer |
| `finam-slide-landscape-light` / `-dark` | слайд 16:9 |

Список с сервера: `GET /v1/content-html/templates`

---

## Definition of done

- [ ] Админ вставил `comon.ru/strategies/{id}/` → HTML A4 light, 2 стр  
- [ ] KPI в макете = из Comon payload  
- [ ] `ide_session_id` в MySQL  
- [ ] Publish → PDF у PFP с utm на CTA  
- [ ] Чат-правки через `messages?stream=1` работают  

---

## Ссылки IDE (контракт)

Полный HTTP: репозиторий IDE → `docs/CONTENT_HTML_API.md`  
Общий handoff Content Factory: `docs/PFP_BACKEND_WHAT_TO_DO.md` / `docs/PFP_CONTENT_HTML_HANDOFF.md`
