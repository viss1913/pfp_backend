# PDF / HTML отчёты (модуль `src/reports`)

**Полная карта пайплайна** (обложка, сводная, страницы целей, API, R2, превью): **`.cursor/skills/pdf-report-backend/SKILL.md`**. Этот README — краткий указатель по папкам и сервисам; при изменении поведения отчёта обновляй **skill** и при необходимости **OpenAPI** (`openapi/PDFsettings.yaml`, `openapi/getReport.yaml`).

---

## Структура каталога

| Путь | Назначение |
|------|------------|
| `cover/` | Первая страница — обложка (`COVER_RENDER_SPEC`, `buildReportCoverHtml`). |
| `summary/` | Сводная «Сводная информация», мок для превью, JSON раскладки для фронта. |
| `goalPages/` | HTML страниц по типу цели: `FIN_RESERVE`, `LIFE`, `INVESTMENT`, `OTHER` (`buildGoalPageHtml`). |
| `finam_v2/` | Изолированный черновик Finam Report v2: McKinsey-style статические страницы, итоговый портфель, налоговое планирование, Comon, ДУ, спецпредложения, инфляция, риски, подробный план, goal-шаблоны, v2 JSON-контракт и отдельный HTML-билдер. Хвостовые блоки описаны в `docs/reports/finam-v2-tail-blocks.md`. |
| `rostech/` | Отдельные ассеты/обвязка под Ростех (если используется). |

Статические снимки вёрстки (для дизайна/регрессии в браузере), если лежат в репо: `summary/preview-default.html`, при необходимости — `goalPages/preview-*.html` (не обязательны для работы API).

---

## Сборка HTML

- **Обложка** — `cover/buildCoverHtml.js`: `buildReportCoverHtml`, `buildCoverLayoutPayload`, дата `formatCoverDateRu` (TZ: `REPORT_PDF_TZ` / `Europe/Moscow`).
- **Сводная** — `summary/buildSummaryOverviewHtml.js`: `SUMMARY_RENDER_SPEC`, `buildReportSummaryOverviewHtml`, `buildSummaryLayoutPayload`. Сток: `assets/reports/summary/`. Карточки целей по типу: `assets/reports/goal-cards/` (см. `goal-cards/README.txt`).
- **Страницы целей** — `goalPages/buildGoalPagesHtml.js`: единая точка входа **`buildGoalPageHtml({ goalType, goal, clientName, options })`**. Брендинг (фон, лого, цвета) сейчас совпадает со сводной — опции из `summary_*` в `agent_report_pdf_settings`, прокидываются из `reportPdfService` и превью.
- **Finam Report v2** — `finam_v2/buildFinamReportV2Html.js`: отдельный экспериментальный билдер для wow-страниц (`Управленческий вывод`, `Сценарии`, `Дорожная карта`, `Партнёрская ценность`) из `finamReportV2Contract.js`; статические страницы и goal-шаблоны лежат рядом (`PORTFOLIO_SUMMARY`, `TAX_PLANNING`, `COMON_AUTOFOLLOW`, `IDU_STRATEGIES`, `FINAM_OFFERS`, `INFLATION`, `RISK_DECLARATION`, `DETAILED_PLAN`, `FIN_RESERVE`, `LIFE`, `PENSION` на 3 листа с методикой расчёта госпенсии, `PASSIVE_INCOME`, `INVESTMENT`, `OTHER`). Пока не подключён к продовому v1 PDF/API.

Хвостовые v2-блоки после налогового планирования:

| Файл | Листов | Смысл |
|------|------:|-------|
| `finam_v2/page-comon-autofollow-v2.html` | 2 | Автоследование Comon |
| `finam_v2/page-idu-strategies-v2.html` | 2 | ДУ / стратегии Финам Фонды |
| `finam_v2/page-finam-offers-v2.html` | 1 | Спецпредложения Финам |
| `finam_v2/page-inflation-v2.html` | 1 | Инфляция и ставки |
| `finam_v2/page-scenarios-v2.html` | 1 | Базовый / стресс / оптимистичный сценарии |
| `finam_v2/page-roadmap-v2.html` | 1 | Дорожная карта 90 дней / 12 месяцев / 3 года |
| `finam_v2/page-detailed-plan-v2.html` | 2 | Подробный план пополнений |
| `finam_v2/page-risk-declaration-v2.html` | 5 | Декларация о рисках: продуктовая экспозиция, компании, матрица `Риск / Доходность`, рыночные/продуктовые риски, протокол контроля |

---

## Данные и JSON для вёрстки

- **`summary/buildSummaryPdfLayoutModel.js`** — `buildSummaryPdfLayoutModel`: продолжение целей, распределение капитала, подсказки вёрстки. В ответе отчёта клиента: **`pdf_summary_layout`** (`reportService.getClientReportData`).
- **`summary/previewMockPayload.json`** — мок отчёта для превью в ЛК: **`GET /api/pfp/pdf-settings/summary-preview-html`** и **`GET /api/pfp/pdf-settings/pages/:pageType/preview-html`**. Для превью страниц целей в `goals[]` должна быть цель на каждый из `FIN_RESERVE`, `LIFE`, `INVESTMENT`, `OTHER`.
- **`summary/preview-default.html`** — зафиксированный снимок сводной с дефолтным брендингом. Пересборка: `node scripts/render_summary_preview_default.mjs`.
- **`finam_v2/finamReportV2Contract.js`** — черновой JSON-контракт `reportSchemaVersion: "finam-v2.0"` для будущего отчёта v2 (`client`, `advisor`, `pages[]`/wow-блоки/сценарии/roadmap/декларация о рисках, `companies[]`, `products[]`, `riskDeclaration.riskRegister[]`).

Заливка карточек целей в R2: **`npm run seed:pdf-goal-cards-r2`** (ключи `pdf-report-goal-cards/…`, в layout — `public_url` при настроенном публичном base).

---

## ЛК: как привязать превью к вкладкам настроек

В **`GET /api/pfp/pdf-settings`** в **`editor_schema.templates[]`** у каждой вкладки задано:

- **`preview_page_type`** — `SUMMARY` \| `FIN_RESERVE` \| `LIFE` \| `INVESTMENT` \| `OTHER` или **`null`** (только обложка: отдельного HTML-превью нет, ориентир `cover_layout`).
- **`preview_html`** — объект с **`path`**, например `/api/pfp/pdf-settings/pages/FIN_RESERVE/preview-html` (префикс приложения `/api` как в остальном API).

Загрузка превью: **`fetch(path, { headers: { Authorization: Bearer … } })`**, затем **`iframe.srcdoc`** или blob-URL (обычный `src` у iframe с API не передаёт токен).

Миниатюры из полей «картинка»: **`GET`** по `read_url.path` возвращает JSON **`{ url, access, … }`**. Если файл не загружен — **`url: null`**, **`access: "none"`**, статус **200** (не ошибка сети).

---

## Сервисы и маршруты (код)

| Что | Где |
|-----|-----|
| Настройки PDF агента, превью HTML | `pdfSettingsService`, `pdfSettingsController`, `routes/pdfSettingsRoutes` |
| Сводная по клиенту | `pdfSettingsService.buildSummaryOverviewHtmlForClient` |
| Сборка многостраничного PDF (Puppeteer) | `services/reportPdfService.js` |
| JSON отчёта и выдача PDF | `reportController`: `GET .../reports/:clientId`, `GET .../reports/:clientId/pdf` |
| HTML одной страницы по клиенту | `reportPagesController`: `GET .../reports/:clientId/pages/:pageType/html` |
| Маршруты | `src/routes/reportRoutes.js` — префикс **`/api/pfp/reports`** (вместе с `pfpMiddleware` в `routes/index.js`) |

Query у **`/pdf`**: **`includeCover`**, **`includeSummary`** (по умолчанию включаются; отключение: `0` / `false`), **`goalTypes`** — подмножество `FIN_RESERVE,LIFE,INVESTMENT,OTHER`.

**`pageType`** (превью и HTML страницы): `SUMMARY` | `FIN_RESERVE` | `LIFE` | `INVESTMENT` | `OTHER`. Алиасы пути для HTML см. `reportPagesController` (например `fin-reserve`, `investment`).

---

## OpenAPI и окружение

- Настройки PDF: **`openapi/PDFsettings.yaml`** (в т.ч. превью страниц).
- Данные отчёта и PDF/HTML клиента: **`openapi/getReport.yaml`** — дополнять при смене контракта.
- R2 и переменные: **`docs/env-cloudflare-r2.md`**.

---

## Правило на будущее

Любая новая страница отчёта или эндпоинт: **skill** + этот README (если новая папка/файл) + OpenAPI, если маршрут публичен для фронта/интеграций.
