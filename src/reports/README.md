# PDF / HTML отчёты

Контекст для ИИ/команды: **`.cursor/skills/pdf-report-backend/SKILL.md`** — весь PDF-отчёт PFP (сейчас в коде в основном обложка + PdfSettings; при новых страницах отчёта skill дополняем).

- **`cover/buildCoverHtml.js`** — первая страница (обложка), общая для всех проектов. Дата: `formatCoverDateRu()` (TZ: `REPORT_PDF_TZ` или `Europe/Moscow`).
- **`summary/preview-default.html`** — статический снимок сводной **по умолчанию** (мок-данные, без кастомного фона агента). Обновление: `node scripts/render_summary_preview_default.mjs`.
- **`summary/previewMockPayload.json`** — тот же JSON, что для **GET `/api/pfp/pdf-settings/summary-preview-html`** (превью в ЛК с настройками агента).
- **`summary/buildSummaryOverviewHtml.js`** — вторая страница «Сводная информация» (макет из Figma PlanOverview, первая A4: лого, ИИ, клиент, защита, до двух основных целей). Лого/аватар ИИ: `assets/reports/summary/`. **Картинки карточек целей по типу** — `assets/reports/goal-cards/{GOAL_TYPE}.png` (см. `goal-cards/README.txt`). Сборка с данными клиента: `pdfSettingsService.buildSummaryOverviewHtmlForClient(agentId, projectId, clientId)`.
- **`summary/buildSummaryPdfLayoutModel.js`** — JSON для фронта/PDF без фиксированной обрезки: `goals_continuation` (страницы карточек после первых двух на сводной), `capital_distribution` (сегменты пирогов по целям), `layout_hints.keep_blocks_together`. У каждой карточки цели — **`goal_card_image.repo_relative_path`** (как у HTML-сводной, папка `assets/reports/goal-cards/`). В ответе отчёта: **`pdf_summary_layout`** (`reportService.getClientReportData`). Фронту нужен свой публичный URL к тем же файлам (или зеркало ассетов), путь в JSON — от корня репо.
- **Настройки агента** — таблица `agent_report_pdf_settings`.
- **API для ЛК** — `GET/PATCH /api/pfp/pdf-settings` (в ответе всегда есть `editor_schema` и **`cover_layout`** — все параметры геометрии/градиентов/типографики + resolved-цвета и текст для превью). Загрузка фона в **Cloudflare R2**: `POST /api/pfp/pdf-settings/cover-background` (`image`, до 8 МБ). Превью: `GET /api/pfp/pdf-settings/cover-image` (прямой или signed URL). Переменные: `docs/env-cloudflare-r2.md`.
- Спека: `openapi/PDFsettings.yaml`.
