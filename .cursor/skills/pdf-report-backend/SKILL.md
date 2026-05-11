---
name: pdf-report-backend
description: Бэкенд PDF-отчёта PFP — обложка, сводная, страницы по типам целей (FIN_RESERVE, LIFE, INVESTMENT, OTHER), Puppeteer-PDF, /api/pfp/pdf-settings и /api/pfp/reports, R2, превью в ЛК. Расширять skill при новых страницах/маршрутах. Не путать с pdfGenerator.js (другой продукт).
---

# PDF-отчёт PFP — бэкенд

## Область скилла (зачем он вообще)

Скилл про **весь пайплайн PDF-отчёта PFP** в этом репо: сборка HTML под печать/PDF, настройки из ЛК, ассеты в **Cloudflare R2**, контракты API и превью.

**Сейчас реализовано в коде:**

1. **Обложка** — `buildCoverHtml.js`, настройки в `pdf-settings`.
2. **Сводная** — `buildSummaryOverviewHtml.js`, `buildSummaryPdfLayoutModel.js` (поле **`pdf_summary_layout`** в данных отчёта), брендинг через `summary_*` в БД. Опциональный блок **Comon-витрина** внизу сводной: поле отчёта **`comon_showcase`**, сервис `comonShowcaseService`, настройки проекта `projects.settings.comon_showcase` (см. `projectComonShowcaseSettings.js`, `docs/report-pdf-frontend-contract.md`).
3. **Четыре типа страниц целей** — `buildGoalPagesHtml.js`: **`FIN_RESERVE`**, **`LIFE`**, **`INVESTMENT`**, **`OTHER`** (общий брендинг со сводной: фон/лого/цвета из тех же `summary_*`).
4. **Finam Report v2 (черновик, не prod v1)** — `src/reports/finam_v2/`: статические McKinsey-style страницы, итоговый портфель, налоговое планирование, Comon, ДУ, спецпредложения, инфляция, декларация о рисках с матрицей `Риск / Доходность`, подробный план, новые goal-страницы (`FIN_RESERVE`, `LIFE`, `PENSION` на 3 листа с методикой расчёта госпенсии, `PASSIVE_INCOME`, `INVESTMENT`, `OTHER`), wow-страницы (`Управленческий вывод`, `Сценарии`, `Дорожная карта`, `Партнёрская ценность`), `finamReportV2Contract.js` и экспериментальный `buildFinamReportV2Html.js`. Порядок v2: диагностика портфеля целей перед управленческим выводом, затем goal-страницы, потом итоговый портфель и продуктовые блоки. Хвостовые блоки описаны в `docs/reports/finam-v2-tail-blocks.md`. Пока не подключён к дефолтному PDF/API.
5. **Сборка полного PDF** — `reportPdfService` (Puppeteer): обложка (опц.) → сводная (опц.) → страницы целей (подмножество через query **`goalTypes`**). Эндпоинт **`GET /api/pfp/reports/:clientId/pdf`**.
6. **Полный HTML отчёта для ЛК агента** — **`GET /api/pfp/reports/:clientId/html`** (`reportController.getClientReportHtml`): JSON с `html`, `pages[]`, `toc[]` без рендера PDF.
7. **HTML одной страницы для клиента** — **`GET /api/pfp/reports/:clientId/pages/:pageType/html`** (`reportPagesController`).
8. **ЛК клиента (B2C)** — **`GET /api/my/plan/report`**, **`GET /api/my/plan/report/pdf`**, **`GET /api/my/plan/comon-showcase`** (`clientCabinetController`).
9. **Превью в ЛК (мок + настройки агента)** — **`GET /api/pfp/pdf-settings/summary-preview-html`**, **`GET /api/pfp/pdf-settings/pages/:pageType/preview-html`** (`pageType`: `SUMMARY` \| `FIN_RESERVE` \| `LIFE` \| `INVESTMENT` \| `OTHER`).

Новые страницы отчёта или эндпоинты — дописывать в этот skill.

## Когда включать этот skill

- Любые правки **PDF-отчёта PFP**: новые/существующие **страницы HTML**, генерация, связка с данными агента/клиента.
- **`/api/pfp/pdf-settings`**, обложка, **`cover_layout`**, **`editor_schema`**, загрузка фонов.
- **R2** для файлов отчёта (обложка, фон/лого сводной, сток-ассеты), env, Railway, миграции URL в БД.
- **`reportPdfService`**, **`reportController.getClientReportPdf`**, **`clientCabinetController.getMyReport` / `getMyReportPdf`**, **`reportPagesController`** (страница HTML по типу).
- Таблица **`agent_report_pdf_settings`** и родственные сущности отчёта.
- После появления новых маршрутов/модулей отчёта — **дописать сюда** пути и файлы в PR.

## Не смешивать с другим PDF в репозитории

- **`src/utils/pdfGenerator.js`** — PDFKit, **другой продукт** (home owners / страхование). К **отчёту PFP** не относится.
- Отчёт PFP живёт в **`src/reports/`** (`cover/`, `summary/`, **`goalPages/`**) + **`pdfSettings*`** + **`reportPdfService`** + **`r2Client`**.

## Архитектура: общее и про обложку

**Общие принципы (на будущие страницы тоже):**

- HTML страниц отчёта по возможности собирать из **одной спеки/модуля** на страницу (как сейчас `COVER_RENDER_SPEC` для обложки), плюс общие шрифты/размеры страницы при необходимости.
- Настройки, которые редактирует агент в ЛК, — отдельный контракт (**`editor_schema`**, PATCH, при необходимости новые таблицы/поля).
- Долгоживущие URL файлов — в **R2** + запись в БД; не подменять тихим диском контейнера без осознанного фолбэка.

**Сейчас конкретно про обложку:**

1. **Один источник вёрстки обложки** — `COVER_RENDER_SPEC` и `src/reports/cover/buildCoverHtml.js` → HTML для PDF и **`buildCoverLayoutPayload`** для превью в API.
2. **Настройки на агента** — `agent_report_pdf_settings` (одна строка на `agent_id`).
3. **`cover_background_url`** — полный URL; смена `R2_PUBLIC_*` не обновляет старые строки → перезаливка / PATCH / `r2:migrate-url-prefix`.
4. Загрузка фона: `multipart` поле **`image`** → **`uploadPublicFile`** → URL в БД.

**Страницы целей (`goalPages`):**

- Один публичный вход — **`buildGoalPageHtml({ goalType, goal, clientName, options })`** в `buildGoalPagesHtml.js`; внутри — отдельные билдеры под тип (фин. подушка, защита жизни, INVESTMENT/OTHER с общей вёрсткой «in-out»).
- Брендинг страниц целей сейчас **не отдельная таблица**: те же опции, что у сводной (`summary_background_url`, `summary_logo_url`, `summary_chart_color`, overlay/текст/линии), прокидываются из `reportPdfService` и из `buildPagePreviewHtml`.

## Ключевые файлы

Новые страницы/маршруты — **добавить строки** в таблицу и секции выше.

| Файл | Роль |
|------|------|
| `src/reports/cover/buildCoverHtml.js` | Спека макета (`COVER_RENDER_SPEC`), `GLOBAL_DEFAULTS`, `buildReportCoverHtml`, `buildCoverLayoutPayload`, дата `formatCoverDateRu` (`REPORT_PDF_TZ` / `Europe/Moscow`) |
| `src/reports/summary/buildSummaryOverviewHtml.js` | `SUMMARY_RENDER_SPEC`, `buildReportSummaryOverviewHtml`, `buildSummaryLayoutPayload`; лого/ИИ — `assets/reports/summary/`; **карточки целей по `goal_type`** — `assets/reports/goal-cards/` (`README.txt`) |
| `src/reports/summary/buildSummaryPdfLayoutModel.js` | `buildSummaryPdfLayoutModel` — JSON для фронта: продолжение целей + распределение капитала; в ответе отчёта **`pdf_summary_layout`** |
| `src/reports/summary/previewMockPayload.json` | Мок отчёта для **`summary-preview-html`** и для превью страниц целей (`goals` по `goal_type`) |
| `src/reports/goalPages/buildGoalPagesHtml.js` | **`buildGoalPageHtml`** — HTML страниц **`FIN_RESERVE`**, **`LIFE`**, **`INVESTMENT`**, **`OTHER`** (графики/блоки под тип цели; ассеты через `resolveGoalCardImageSrc` / R2 prefix `pdf-report-summary-stock-assets`) |
| `src/reports/finam_v2/` | Изолированный черновик Finam Report v2: статические страницы, `page-portfolio-summary-v2.html`, хвостовые блоки Comon/ДУ/спецпредложения/инфляция/риски/подробный план, goal-страницы включая `page-goal-passive-income-v2.html`, `page-goal-save-grow-v2.html` и `page-goal-other-v2.html`, preview, order, `page-wow-shared.css`, `finamReportV2Contract.js`, `buildFinamReportV2Html.js` |
| `src/services/reportPdfService.js` | Сборка списка HTML-страниц → Puppeteer **`page.pdf()`**; опция **`brandingAgentId`** (ЛК клиента) или **`agentId`** из JWT (агент) |
| `src/controllers/reportController.js` | **`getClientReportPdf`** — отдача PDF буфером |
| `src/controllers/clientCabinetController.js` | **`getMyReport`**, **`getMyReportPdf`** — отчёт/PDF для B2C |
| `src/controllers/reportPagesController.js` | **`getPageHtml`** — HTML одной страницы по **`pageType`** для клиента |
| `src/routes/reportRoutes.js` | **`/pfp/reports/:clientId`**, **`/pdf`**, **`/pages/:pageType/html`** |
| `src/routes/clientCabinetRoutes.js` | **`/my/plan/report`**, **`/my/plan/report/pdf`** |
| `database/migrations/*_add_summary_page_pdf_settings.js` | `summary_logo_url`, `summary_accent_color` (legacy), `summary_ai_avatar_url` (legacy) |
| `database/migrations/*_add_summary_background_chart_color.js` | `summary_background_url`, `summary_chart_color` |
| `src/services/pdfSettingsService.js` | БД, `mergeWithDefaults`, **`getDefaultsMerged()`** (PDF без агента), `editor_schema`, превью HTML |
| `src/controllers/pdfSettingsController.js` | GET/PATCH/POST; ответ **`storage`**: `r2` \| `local_disk`; 503 `R2_PUBLIC_URL_MISSING` / `R2_PUT_FAILED` при настроенном R2 |
| `src/routes/pdfSettingsRoutes.js` | Multer: до 8 МБ, `image/jpeg`, `png`, `webp`; поле формы **`image`**; превью-роуты |
| `src/utils/r2Client.js` | `uploadPublicFile` (Put → без `R2_PUBLIC_*` откат Delete), `getR2StartupDiagnostics`, алиасы **`CLOUDFLARE_ACCOUNT_ID`**, `trimEnv`, публичная база `R2_PUBLIC_*` |
| `src/routes/index.js` | `'/pfp/pdf-settings'`, **`'/pfp/reports'`**, **`'/my'`** (кабинет) + `pfpMiddleware` |
| `openapi/PDFsettings.yaml` | PdfSettings, превью HTML (в т.ч. `pages/{pageType}/preview-html`); Swagger: `/api-docs-pdf-settings` |
| `openapi/getReport.yaml` | Отчёт: `GET /pfp/reports/{clientId}`, PDF, HTML страницы; ЛК: `GET /my/plan/report`, `.../report/pdf` |
| `docs/env-cloudflare-r2.md` | Все переменные R2, типовые ошибки, скрипты |
| `src/reports/README.md` | Краткая карта модуля отчётов (при расширении goal pages — имеет смысл синхронизировать с этим skill) |
| `docs/reports/finam-v2-tail-blocks.md` | Документация по хвостовым блокам Finam v2: Comon, ДУ, спецпредложения, инфляция, полная декларация о рисках, подробный план |

## HTTP API: PdfSettings (префикс приложения: `/api`)

Маршрут вешается в `src/routes/index.js`: `router.use('/pfp/pdf-settings', pfpMiddleware, …)`, где `pfpMiddleware = [authMiddleware, tenantMiddleware]`.

| Метод | Путь | Назначение |
|--------|------|------------|
| GET | `/api/pfp/pdf-settings` | `editor_schema`, `cover_layout`, `summary_layout`, **`goal_card_assets`** (картинки карточек целей для превью ЛК: `cards[].public_url` по `goal_type`), `date_preview`, сводная: `summary_background_url`, `summary_logo_url`, `summary_chart_color` |
| PATCH | `/api/pfp/pdf-settings` | Обложка + сводная (в т.ч. `summary_background_url`, `summary_logo_url`, `summary_chart_color`; пустая строка сбрасывает URL в БД) |
| POST | `/api/pfp/pdf-settings/cover-background` | Multipart **`image`**. R2: `pdf-report-covers/...` |
| POST | `/api/pfp/pdf-settings/summary-background` | Multipart **`image`** → `summary_background_url`. R2: `pdf-report-summary/.../background_*` |
| POST | `/api/pfp/pdf-settings/summary-logo` | Multipart **`image`** → `summary_logo_url`. R2: `pdf-report-summary/.../logo_*` |
| GET | `/api/pfp/pdf-settings/cover-image` | JSON: `url` + `access` (`direct` \| `signed` \| **`none`**). Если фон не загружен — **200**, `url: null`, `access: none` (не 404) |
| GET | `/api/pfp/pdf-settings/summary-background-image` | То же; без фона — 200, `url: null`, `access: none` |
| GET | `/api/pfp/pdf-settings/summary-logo-image` | То же; без лого — 200, `url: null`, `access: none` |
| GET | `/api/pfp/pdf-settings/summary-preview-html` | HTML превью сводной (мок + настройки агента), `text/html` |
| GET | `/api/pfp/pdf-settings/pages/:pageType/preview-html` | HTML превью **любой** страницы отчёта: `SUMMARY` \| `FIN_RESERVE` \| `LIFE` \| `INVESTMENT` \| `OTHER`; для целей — мок **`goals[]`** из **`src/reports/summary/previewMockPayload.json`** + настройки агента |

## HTTP API: отчёт клиента (`/api/pfp/reports`)

Префикс: `router.use('/pfp/reports', pfpMiddleware, reportRoutes)`.

| Метод | Путь | Назначение |
|--------|------|------------|
| GET | `/api/pfp/reports/:clientId` | Структурированные данные отчёта (в т.ч. **`pdf_summary_layout`**) |
| GET | `/api/pfp/reports/:clientId/pdf` | Готовый PDF: query **`includeCover`**, **`includeSummary`**, **`goalTypes`**; **`disposition=attachment`** — скачивание вместо inline |
| GET | `/api/pfp/reports/:clientId/html` | Полный HTML отчёта: по умолчанию JSON (`html`, `pages[]`, `toc[]`); **`?inline=1`** или **`?format=html`** → ответ **`text/html`** (вкладка/`iframe src`) |
| GET | `/api/pfp/reports/:clientId/pages/:pageType/html` | HTML одной страницы для печати/PDF; **`pageType`** как в превью (`SUMMARY`, …) |

## HTTP API: отчёт в ЛК клиента (`/api/my`, JWT с `clientId`)

Префикс: `router.use('/my', pfpMiddleware, clientCabinetRoutes)` + `restrictTo('client', …)`.

| Метод | Путь | Назначение |
|--------|------|------------|
| GET | `/api/my/plan/report` | Тот же JSON, что **`/api/pfp/reports/:clientId`**, для **`req.user.clientId`** |
| GET | `/api/my/plan/report/pdf` | PDF: те же query, что у агентского PDF; стиль из **`agent_report_pdf_settings`** закреплённого агента или дефолты |
| GET | `/api/my/plan/report/html` | Как агентский HTML: JSON по умолчанию; **`?inline=1`** / **`?format=html`** → `text/html` |

Ответы PdfSettings включают **`editor_schema`** (контракт для ЛК): у каждого **`templates[]`** — **`preview_page_type`** и **`preview_html`** (путь к GET превью HTML вкладки, кроме обложки). Плюс **`cover_layout`** (геометрия + resolved цвета/текст). **Публичный URL фона нигде не дублируется:** только корневое поле **`cover_background_url`** (или **`GET /api/pfp/pdf-settings/cover-image`**, если нужен signed). Внутри `cover_layout.background` — лишь `uses_custom_upload` и `fallback_repo_relative_path` к стоковому jpg в репо, когда свой фон не задан.

## Почему в БД URL вида `…railway.app/uploads/pdf-report-covers/…`

Только если **R2 вообще не сконфигурирован** (клиент S3 не собирается): тогда фолбэк на диск. Если ключи к R2 заданы, а нет **`R2_PUBLIC_*`** или **PutObject** падает — бэк отвечает **503** (`R2_PUBLIC_URL_MISSING` / `R2_PUT_FAILED`), в БД путь Railway **не** подставляется. См. `docs/env-cloudflare-r2.md`, `STORAGE_REQUIRE_R2`.

## Cloudflare R2 — обязательно понимать

- После успешной загрузки публичный URL = **`bases[0]`** из env (первый непустой из `R2_PUBLIC_BASE_URL`, `R2_CDN_BASE_URL`, `R2_PUBLIC_DOMAIN`) + ключ объекта. Не дублировать логику на фронте.
- **`R2_ACCESS_KEY_ID`** — от R2 API Token, не Account ID.
- Endpoint без имени бакета в path (типично `https://<accountid>.r2.cloudflarestorage.com`).
- Если **`STORAGE_REQUIRE_R2=1`**, без R2 загрузка не уходит в диск — будет 503.
- Старые URL в БД после смены `pub-….r2.dev`: скрипт **`npm run r2:migrate-url-prefix`** (`R2_PUBLIC_URL_REPLACE_FROM`, опционально `R2_PUBLIC_URL_REPLACE_TO`, `DRY_RUN`).

Подробности и чеклисты: `docs/env-cloudflare-r2.md`. При старте сервера в логах строка **`[R2] готов к загрузкам: bucket=… public_base=…`** — сверка Railway с локальным `.env`.

## Скрипты (корень репо)

- `npm run r2:smoke` — проверка конфигурации R2 локально.
- `npm run seed:pdf-cover-default` — общий файл в R2 + заполнение `cover_background_url` агентам (опция `SEED_COVER_ONLY_EMPTY`).
- `npm run seed:pdf-goal-cards-r2` — картинки `assets/reports/goal-cards/*` → R2 `pdf-report-goal-cards/{имя файла}`; после этого в `pdf_summary_layout` и HTML-сводной доступен `public_url` на CDN.
- `npm run r2:migrate-url-prefix` — замена префикса URL в БД.
- `scripts/test_pdf_cover_upload.mjs` — ручной тест POST обложки (см. файл, JWT).

## Правила для агента (чтобы ничего не сломать)

1. **Новая страница отчёта** — по возможности отдельный модуль/спека + запись в этом skill (файлы, API, превью). Не плодить расхождения «HTML для PDF» vs «JSON для ЛК» без общей функции сборки.
2. **Обложка**: геометрия только через **`COVER_RENDER_SPEC`** / `buildCoverHtml.js`; **`cover_layout`** из тех же дефолтов/санитайзеров (`sanitizeTitleBandColor`).
3. **Дефолтный текст плашки** — **`GLOBAL_DEFAULTS.coverTitle`**; синхронизировать `openapi/PDFsettings.yaml` и миграции при смене.
4. Multipart для обложки — поле **`image`** (editor_schema + multer); для будущих загрузок — явно прописать в skill и схеме.
5. Публичные URL объектов в R2 — через **`uploadPublicFile`** / **`getPublicBaseCandidates`**, не собирать URL вручную.
6. **`cover_background_url`** и аналоги — полный URL в БД; смена env не чинит старые строки автоматически.
7. **Страницы целей** — правки через **`buildGoalPageHtml`** в `buildGoalPagesHtml.js`; мок под превью ЛК — **`previewMockPayload.json`** (должен содержать цель на каждый из `FIN_RESERVE` / `LIFE` / `INVESTMENT` / `OTHER`, иначе превью вернёт 404).

## Быстрый чеклист перед PR

- [ ] Если трогали отчёт — **обновлён этот skill** (новые страницы/эндпоинты/файлы).
- [ ] Цели/PDF: согласованы **`reportPdfService`**, **`getPageHtml`** и **`buildPagePreviewHtml`** (одинаковые `goalType`, опции брендинга).
- [ ] Обложка: `cover_layout` и HTML из одной спеки (`COVER_RENDER_SPEC`).
- [ ] Joi/валидация согласована с фронтом (для обложки — `#RRGGBB` плашки).
- [ ] R2: не ломаем `STORAGE_REQUIRE_R2`, 503-коды при ошибках, осмысленный фолбэк на диск.
- [ ] OpenAPI (`PDFsettings.yaml`, `getReport.yaml`) / `docs/env-cloudflare-r2.md` — если менялся контракт или поведение загрузок.

Дополнительно: `src/reports/README.md`.
