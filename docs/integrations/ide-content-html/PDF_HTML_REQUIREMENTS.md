# Content Factory — требования к HTML для PDF и preview

**Для:** команда IDE (`ide-api`, Content HTML API)  
**От:** PFP backend (Content Factory BFF)  
**Дата:** 2026-07-19  
**Статус:** обязательный контракт для каждого turn, который отдаёт `html` в PFP

---

## Зачем

PFP **не** правит вёрстку оффера. Мы:

1. сохраняем `html` из IDE в `content_offers.generated_html`;
2. показываем **preview** в админке (`iframe srcDoc`);
3. собираем **PDF** через Puppeteer (`page.setContent(html)` → A4).

Если в HTML остаются неразрешённые картинки или внешние ресурсы — в preview и PDF будут **битые иконки**, пустой hero, «голый» текст. Это не баг Puppeteer, это **HTML не готов к offline-рендеру**.

**Красивый PDF = self-contained HTML от IDE + наш Puppeteer.** IDE не генерирует PDF.

---

## Кто за что отвечает

| Слой | Ответственность |
|------|-----------------|
| **IDE** | Финальный `html` после turn: все картинки inline, CSS в документе, A4 print rules, CTA slot |
| **PFP** | Sync из IDE перед PDF (если видим плейсхолдеры), CTA href/label, `utm_agent` в PDF, Puppeteer |
| **Front** | Preview через `srcDoc` — те же ограничения, что у PDF |

---

## Обязательные правила (MUST)

### 1. Картинки — только inline base64

После **каждого** turn, который возвращает `html` в PFP:

- `<img src="...">` → `src="data:image/png;base64,..."` (или jpeg/webp/gif)
- `background-image: url(...)` → `url(data:image/...;base64,...)`
- Логотип Finam из шаблона — **не удалять**, оставить inline base64 из seed-шаблона

**Запрещено** в финальном HTML:

| Паттерн | Почему ломается |
|---------|-----------------|
| `__CF_DATA_URI_*` | Puppeteer / iframe не знают, что подставить |
| `src="assets/..."`, `url(assets/...)` | Нет файловой системы сессии у PFP |
| `src="assets/user/..."` | То же для user media |
| `http://`, `https://` на img/font/css | Сеть в headless может быть недоступна; CDN блокируется |
| `file://` | Не работает в Puppeteer |

User media, загруженное через `POST /sessions/{id}/media`, должно **инлайниться в HTML до ответа** turn (не оставлять только путь в сессии).

### 2. Self-contained документ

- Один `<!DOCTYPE html>`, полный `<html>`
- CSS в `<style>` внутри `<head>` (или критичные inline-стили на элементах)
- **Без** `<link rel="stylesheet" href="...">` на внешние URL
- **Без** `@import url("https://...")`
- Шрифты: system stack (`Segoe UI`, `Roboto`, `Arial`) **или** `@font-face` с base64 woff2 внутри документа
- Графики: **inline SVG** или HTML-таблица — без Chart.js CDN и т.п.

### 3. A4 / print

Шаблоны Finam уже содержат `@page` и `.sheet`. При правках **сохранять**:

- `@page { size: A4 ...; margin: 0; }` (portrait или landscape по `base_template_id`)
- `-webkit-print-color-adjust: exact; print-color-adjust: exact;`
- Chrome шаблона: header (лого Finam), footer «ООО «Финам»», `data-cf-template`, `data-cf-orient`, `data-cf-theme`
- `constraints.preserve_template_chrome: true` — не вырезать шапку/подвал

### 4. CTA placeholder (PFP подставит href и label)

```html
<a data-cta-slot href="#">{{cta_label}}</a>
```

- Атрибут **`data-cta-slot`** обязателен для publish в PFP
- PFP подставляет `cta_url_base`, `cta_label`; в PDF агента добавляет `utm_agent`

### 5. Размер HTML

HTML с инлайном base64 может быть **сотни KB — несколько MB**. Это нормально.

- PFP хранит в `generated_html` (**LONGTEXT**)
- IDE **не** должен оставлять плейсхолдеры «ради экономии размера»

---

## Рекомендации (SHOULD)

- Hero / фон: если картинка нужна — inline в CSS или `<img>`, не только `assets/hero.png`
- Не добавлять `<script>` с внешними зависимостями; для PDF достаточно статики
- `page_count > 1`: N блоков `.sheet` / `data-page`, `page-break-after` между листами; CTA на **последней** странице
- Язык контента: `constraints.language: ru`

---

## Acceptance checklist (IDE перед `result.html`)

Перед отдачей HTML в PFP (SSE `result` или `GET session`):

- [ ] В HTML **нет** `__CF_DATA_URI`
- [ ] В HTML **нет** `src="assets/` и `url(assets/`
- [ ] В HTML **нет** `http://` / `https://` в `src=` img и `url()` в CSS (кроме data:)
- [ ] Есть `<a data-cta-slot ...>`
- [ ] Сохранены header/footer Finam и атрибуты `data-cf-*` на body (если шаблон Finam)
- [ ] Preview в IDE (если есть) визуально совпадает с тем, что уйдёт в PFP

### Быстрая автопроверка (regex)

```javascript
function assertPdfReadyHtml(html) {
  const h = String(html || '');
  const errors = [];
  if (!h.trim()) errors.push('EMPTY_HTML');
  if (h.includes('__CF_DATA_URI')) errors.push('PLACEHOLDER_DATA_URI');
  if (/\bsrc\s*=\s*["']assets\//i.test(h)) errors.push('RELATIVE_IMG_SRC');
  if (/url\s*\(\s*["']?assets\//i.test(h)) errors.push('RELATIVE_CSS_URL');
  if (/<img\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(h)) errors.push('EXTERNAL_IMG');
  if (!/\bdata-cta-slot\b/.test(h)) errors.push('MISSING_CTA_SLOT');
  return errors;
}
```

---

## Как PFP проверяет HTML сегодня

Перед PDF (presentation) PFP вызывает sync из IDE, если HTML «грязный»:

```javascript
// src/services/contentFactoryService.js — needsIdeHtmlSync()
html.includes('__CF_DATA_URI') || /\bassets\//.test(html)
```

Если после sync плейсхолдеры **остались** — PDF всё равно будет с битыми картинками. Исправлять нужно на стороне IDE.

---

## Constraints при создании сессии (reference)

PFP шлёт в `POST /v1/content-html/sessions`:

```json
{
  "constraints": {
    "base_template_id": "finam-a4-portrait-light",
    "page_count": 1,
    "preserve_template_chrome": true,
    "preserve_attributes": ["data-cta-slot"],
    "language": "ru"
  }
}
```

**Предложение для IDE (v1.2):** читать в system prompt явный флаг:

```json
{
  "pdf_ready": true,
  "inline_all_images": true
}
```

---

## Связанные документы

| Файл | Содержание |
|------|------------|
| [CONTENT_HTML_API.md](./CONTENT_HTML_API.md) | Полный API v1.1 |
| [IDE_CONTENT_HTML_TEMPLATES_TASK.md](./IDE_CONTENT_HTML_TEMPLATES_TASK.md) | Шаблоны Finam, `base_template_id` |
| [../../../assets/content-factory/templates/README.md](../../../assets/content-factory/templates/README.md) | Файлы seed-шаблонов |
| [../../../assets/content-factory/PDF_HTML_REQUIREMENTS.md](../../../assets/content-factory/PDF_HTML_REQUIREMENTS.md) | Копия для команды PFP (шаблоны) |

---

## Контакт / вопросы

При расхождении preview IDE и PDF PFP — первым делом прогнать checklist выше на `session.html` до сохранения в MySQL.
