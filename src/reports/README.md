# PDF / HTML отчёты

- **`cover/buildCoverHtml.js`** — первая страница (обложка), общая для всех проектов. Дата: `formatCoverDateRu()` (TZ: `REPORT_PDF_TZ` или `Europe/Moscow`).
- **Настройки агента** — таблица `agent_report_pdf_settings`.
- **API для ЛК** — `GET/PATCH /api/pfp/pdf-settings` (в ответе всегда есть `editor_schema` — описание полей для UI). Загрузка фона: `POST /api/pfp/pdf-settings/cover-background`, поле формы `image`, до 8 МБ.
- Спека: `openapi/PDFsettings.yaml`.
