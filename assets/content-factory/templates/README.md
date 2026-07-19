# Content Factory — базовые HTML-шаблоны (Finam)

Статические шаблоны для **Content Factory**. Не редактируются через админку PFP — правим в репозитории вручную.

## Где лежат

```
assets/content-factory/templates/
├── manifest.json
├── finam-logo.png
├── finam-a4-portrait-light.html
├── finam-a4-portrait-dark.html
├── finam-a4-landscape-light.html
└── finam-a4-landscape-dark.html
```

**Абсолютный путь (локально):**  
`C:\Users\User\Desktop\backend PFP\assets\content-factory\templates\`

**В git (от корня репо):**  
`assets/content-factory/templates/`

## Каталог шаблонов

| `template_id` | Файл | Ориентация | Тема |
|---------------|------|------------|------|
| `finam-a4-portrait-light` | `finam-a4-portrait-light.html` | A4 вертикально (210×297 mm) | светлая |
| `finam-a4-portrait-dark` | `finam-a4-portrait-dark.html` | A4 вертикально | тёмная |
| `finam-a4-landscape-light` | `finam-a4-landscape-light.html` | A4 горизонтально (297×210 mm) | светлая |
| `finam-a4-landscape-dark` | `finam-a4-landscape-dark.html` | A4 горизонтально | тёмная |

Машиночитаемый список: `manifest.json`.

## Что внутри каждого шаблона

- Логотип Финам (inline base64) в шапке
- Область контента с placeholder (IDE заменит по brief)
- CTA: `<a data-cta-slot href="#">{{cta_label}}</a>` — PFP подставит href/label, в PDF добавит `utm_agent`
- Подвал: **ООО «Финам» · ИНН 323323232** и **+7 (495) 122-77-88**
- Атрибуты на `<body>`: `data-cf-template`, `data-cf-orient`, `data-cf-theme`
- Self-contained CSS в `<style>`, `@page` под A4

## Пересборка после правок лого

Если меняете только `finam-logo.png`:

```bash
# 1) обновить base64 (Windows PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("assets/content-factory/templates/finam-logo.png")) | Set-Content -NoNewline "assets/content-factory/templates/finam-logo.base64.txt"

# 2) перегенерить 4 HTML (если правили build-скрипт, не сами HTML)
node scripts/build_content_factory_templates.mjs
```

Если правите HTML руками — **не запускайте** build-скрипт, он перезапишет файлы.

## Как передать в IDE

См. задачу для команды IDE:  
[`docs/integrations/ide-content-html/IDE_CONTENT_HTML_TEMPLATES_TASK.md`](../../docs/integrations/ide-content-html/IDE_CONTENT_HTML_TEMPLATES_TASK.md)

Кратко:

1. **IDE забирает файлы** из этого каталога (копия в `ide-api` или submodule — на усмотрение IDE).
2. PFP при создании сессии шлёт **`constraints.base_template_id`** (предлагаемое поле API).
3. Альтернатива v0 (уже есть): PFP читает HTML с диска и передаёт **`initial_html`** в `POST /v1/content-html/sessions` — работает, но дублирует логику выбора шаблона на стороне PFP.

## Связанные документы

- [`docs/integrations/ide-content-html/PDF_HTML_REQUIREMENTS.md`](../../docs/integrations/ide-content-html/PDF_HTML_REQUIREMENTS.md) — **требования к HTML для PDF/preview (для IDE)**
- [`../PDF_HTML_REQUIREMENTS.md`](../PDF_HTML_REQUIREMENTS.md) — краткая ссылка на тот же док (рядом с шаблонами)
- [`docs/integrations/ide-content-html/CONTENT_HTML_API.md`](../../docs/integrations/ide-content-html/CONTENT_HTML_API.md) — текущий контракт IDE
- [`.cursor/agents/content-factory.md`](../../.cursor/agents/content-factory.md) — агент CF
