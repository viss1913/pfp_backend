# Задача для IDE: базовые HTML-шаблоны Content Factory

**От:** PFP (Content Factory)  
**Кому:** команда `ide-api`  
**Дата:** 2026-07-14  
**Статус:** постановка (обсуждение API)

---

## Контекст

В PFP админ создаёт продуктовые A4-материалы через чат IDE. Сейчас при `POST /v1/content-html/sessions` без `initial_html` IDE подставляет **свой дефолтный** A4-шаблон.

Нам нужны **4 фиксированных корпоративных шаблона Finam** (не CRUD в админке):

| ID | Ориентация | Тема |
|----|------------|------|
| `finam-a4-portrait-light` | A4 вертикально | светлая |
| `finam-a4-portrait-dark` | A4 вертикально | тёмная |
| `finam-a4-landscape-light` | A4 горизонтально | светлая |
| `finam-a4-landscape-dark` | A4 горизонтально | тёмная |

Шаблоны уже свёрстаны в репозитории PFP. Редактируем их **в git**, не через UI.

---

## Откуда взять файлы

**Репозиторий:** backend PFP  
**Каталог:**

```
assets/content-factory/templates/
├── manifest.json
├── finam-logo.png
├── finam-a4-portrait-light.html
├── finam-a4-portrait-dark.html
├── finam-a4-landscape-light.html
└── finam-a4-landscape-dark.html
```

`manifest.json` — список `template_id` + метаданные (orientation, theme, page_size).

Каждый HTML:

- self-contained (`<style>` внутри, логотип inline base64);
- подвал: `ООО «Финам» · ИНН 323323232` и `+7 (495) 122-77-88`;
- CTA placeholder: `<a data-cta-slot href="#">{{cta_label}}</a>`;
- `@page` под нужную ориентацию A4.

**Предложение по деплою на IDE:** скопировать каталог в образ `ide-api`, например:

```
/opt/ide-api/content-html-templates/finam/
```

или env `CONTENT_HTML_TEMPLATES_ROOT=/opt/ide-api/content-html-templates`.

---

## Что просим добавить в API

### Вариант A (рекомендуем) — `base_template_id` в constraints

Расширить `constraints` в `POST /sessions` и `POST /generate`:

```json
{
  "title": "Оффер: Подушка безопасности",
  "brief": "Одна страница про НСЖ…",
  "generate": true,
  "constraints": {
    "single_page": true,
    "format_hint": "a4_print",
    "base_template_id": "finam-a4-portrait-light",
    "preserve_attributes": ["data-cta-slot"],
    "language": "ru"
  }
}
```

**Поведение IDE:**

1. Если передан `base_template_id` — загрузить соответствующий HTML из каталога шаблонов.
2. Если `initial_html` **тоже** передан — **`initial_html` имеет приоритет** (override для миграций/отладки).
3. Если `base_template_id` неизвестен → **400** `{ "error": "unknown_template", "message": "...", "known_templates": [...] }`.
4. Если ни `initial_html`, ни `base_template_id` — текущий дефолт IDE (backward compatible).
5. На каждом turn агенты **сохраняют** шапку/подвал/CTA-slot, если в constraints есть `preserve_template_chrome: true` (опционально, см. ниже).

### Вариант B (уже работает) — только `initial_html`

PFP читает файл с диска и шлёт полный HTML в `initial_html`. Минус: дублирование каталога шаблонов на PFP, IDE не знает id шаблона для prompt-контекста.

**Можем стартовать с B**, но для админки (выбор «вертикальный светлый») и промптов агентам нужен **A**.

---

## Дополнительно (желательно)

### GET `/v1/content-html/templates`

Список доступных шаблонов для UI PFP (dropdown при создании оффера):

```json
{
  "templates": [
    {
      "id": "finam-a4-portrait-light",
      "title": "Finam A4 — вертикальный, светлый",
      "orientation": "portrait",
      "theme": "light",
      "format": "a4",
      "preview_thumbnail_url": null
    }
  ]
}
```

Preview/thumbnail — опционально, v2.

### `preserve_template_chrome` (boolean)

```json
"constraints": {
  "base_template_id": "finam-a4-portrait-dark",
  "preserve_template_chrome": true,
  "preserve_attributes": ["data-cta-slot"]
}
```

Если `true` — site_architect / code_generator **не удаляют** `<header class="header">`, `<footer class="footer">`, логотип и `@page size`. Меняют только `.content`.

### `format_hint` — уточнение

Сейчас: `"a4_print"`. Предлагаем принимать также:

| `format_hint` | Эквивалент `base_template_id` (если id не передан) |
|---------------|-----------------------------------------------------|
| `a4_portrait_light` | `finam-a4-portrait-light` |
| `a4_portrait_dark` | `finam-a4-portrait-dark` |
| `a4_landscape_light` | `finam-a4-landscape-light` |
| `a4_landscape_dark` | `finam-a4-landscape-dark` |

Либо оставить `format_hint: "a4_print"` общим, а ориентацию/тему — только через `base_template_id`.

---

## Пример flow (целевой)

```
Admin UI: выбрал «A4 горизонтальный, тёмный»
    ↓
PFP BFF: POST /v1/content-html/sessions
    {
      "brief": "...",
      "generate": true,
      "constraints": {
        "base_template_id": "finam-a4-landscape-dark",
        "preserve_template_chrome": true,
        "preserve_attributes": ["data-cta-slot"]
      }
    }
    ↓
IDE: стартовый HTML = finam-a4-landscape-dark.html → LLM правит .content
    ↓
PFP: сохраняет result.html → publish → PDF агента
```

---

## Что сделает PFP после вашего OK

1. Поле `base_template_id` в `POST /admin/content-factory/offers` (body).
2. Прокидывание в `ideContentHtmlClient.createSession({ constraints })`.
3. Fallback: если IDE ещё без `base_template_id` — читаем HTML из `assets/content-factory/templates/` и шлём `initial_html`.
4. Док: обновить `CONTENT_HTML_API.md` § Constraints.

---

## Acceptance criteria (IDE)

- [ ] Каталог шаблонов Finam задеплоен на `ide-api`
- [ ] `POST /sessions` + `POST /generate` понимают `constraints.base_template_id`
- [ ] Неизвестный id → 400 с перечислением valid ids
- [ ] `initial_html` перебивает `base_template_id`
- [ ] Generate с brief **не ломает** footer, logo, `data-cta-slot`
- [ ] (опционально) `GET /templates` для админки
- [ ] Smoke: 4 id → html содержит подвал «ООО «Финам»» и `data-cta-slot`

---

## Связанные документы

| Файл | Назначение |
|------|------------|
| [`CONTENT_HTML_API.md`](./CONTENT_HTML_API.md) | Текущий HTTP-контракт |
| [`PFP_CONTENT_HTML_HANDOFF.md`](./PFP_CONTENT_HTML_HANDOFF.md) | Handoff PFP |
| [`../../assets/content-factory/templates/README.md`](../../assets/content-factory/templates/README.md) | Каталог файлов шаблонов |
| [`../../docs/IDE_CONTENT_HTML_API_TASK.md`](../../docs/IDE_CONTENT_HTML_API_TASK.md) | Исходная постановка CF API |

---

## Вопросы на обсуждение

1. Где хранить шаблоны на IDE — файловая система vs БД?
2. Нужен ли `GET /templates/{id}/html` для preview без создания сессии?
3. Как версионировать шаблоны (`finam-a4-portrait-light@v2`)?
4. Multi-tenant: позже шаблоны Сбера/АТБ — тот же механизм с префиксом бренда?

Ответьте, пожалуйста, по **варианту A** (base_template_id) — ок / правки — и зафиксируем в OpenAPI IDE.
