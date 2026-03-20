# PDF / HTML отчёты

- **`cover/buildCoverHtml.js`** — первая страница (обложка), общая для всех проектов. Дата: `formatCoverDateRu()` (TZ: `REPORT_PDF_TZ` или `Europe/Moscow`).
- **Настройки агента** — таблица `agent_report_pdf_settings`.
- **API для ЛК** — `GET/PATCH /api/pfp/pdf-settings` (в ответе всегда есть `editor_schema` и **`cover_layout`** — все параметры геометрии/градиентов/типографики + resolved-цвета и текст для превью). Загрузка фона в **Cloudflare R2**: `POST /api/pfp/pdf-settings/cover-background` (`image`, до 8 МБ). Превью: `GET /api/pfp/pdf-settings/cover-image` (прямой или signed URL). Переменные: `docs/env-cloudflare-r2.md`.
- Спека: `openapi/PDFsettings.yaml`.
