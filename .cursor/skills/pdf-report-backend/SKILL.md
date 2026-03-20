---
name: pdf-report-backend
description: Бэкенд PDF-отчёта PFP (не только обложка): HTML-страницы отчёта, настройки агента, R2, превью в ЛК. Сейчас в коде — обложка + /api/pfp/pdf-settings; при добавлении других страниц отчёта — расширять этот skill. Не путать с pdfGenerator.js (другой продукт).
---

# PDF-отчёт PFP — бэкенд

## Область скилла (зачем он вообще)

Скилл про **весь пайплайн PDF-отчёта PFP** в этом репо: сборка HTML под печать/PDF, настройки из ЛК, ассеты в **Cloudflare R2**, контракты API и превью.

**Сейчас реализовано в коде** — в основном **первая страница (обложка)** и API **`/api/pfp/pdf-settings`**. Когда появятся **другие страницы отчёта** (риски, текстовые блоки, свои шаблоны, отдельные эндпоинты) — их описываем **в этом же skill** (новые секции, файлы, OpenAPI), чтобы один источник правды по отчёту, а не отдельная «только обложка» легенда.

## Когда включать этот skill

- Любые правки **PDF-отчёта PFP**: новые/существующие **страницы HTML**, генерация, связка с данными агента/клиента.
- **`/api/pfp/pdf-settings`**, обложка, **`cover_layout`**, **`editor_schema`**, загрузка фонов.
- **R2** для файлов отчёта (обложки и в будущем — другие медиа), env, Railway, миграции URL в БД.
- Таблица **`agent_report_pdf_settings`** и родственные сущности отчёта.
- После появления новых маршрутов/модулей отчёта — **дописать сюда** пути и файлы в PR.

## Не смешивать с другим PDF в репозитории

- **`src/utils/pdfGenerator.js`** — PDFKit, **другой продукт** (home owners / страхование). К **отчёту PFP** не относится.
- Отчёт PFP живёт в **`src/reports/`** (сейчас **`cover/`** и т.д.) + **`pdfSettings*`** + **`r2Client`** для ассетов.

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

## Ключевые файлы (сейчас — обложка и PdfSettings)

Когда появятся новые страницы отчёта — **добавить строки** в эту таблицу и секции выше.

| Файл | Роль |
|------|------|
| `src/reports/cover/buildCoverHtml.js` | Спека макета (`COVER_RENDER_SPEC`), `GLOBAL_DEFAULTS`, `buildReportCoverHtml`, `buildCoverLayoutPayload`, дата `formatCoverDateRu` (`REPORT_PDF_TZ` / `Europe/Moscow`) |
| `src/services/pdfSettingsService.js` | БД, `mergeWithDefaults`, `editor_schema`, `cover_layout`, `buildCoverHtmlForAgent`, signed URL для превью |
| `src/controllers/pdfSettingsController.js` | GET/PATCH/POST; ответ **`storage`**: `r2` \| `local_disk`; 503 `R2_PUBLIC_URL_MISSING` / `R2_PUT_FAILED` при настроенном R2 |
| `src/routes/pdfSettingsRoutes.js` | Multer: до 8 МБ, `image/jpeg`, `png`, `webp`; поле формы **`image`** |
| `src/utils/r2Client.js` | `uploadPublicFile` (Put → без `R2_PUBLIC_*` откат Delete), `getR2StartupDiagnostics`, алиасы **`CLOUDFLARE_ACCOUNT_ID`**, `trimEnv`, публичная база `R2_PUBLIC_*` |
| `src/routes/index.js` | `'/pfp/pdf-settings'` + `pfpMiddleware` |
| `openapi/PDFsettings.yaml` | Документация API (Swagger: `/api-docs-pdf-settings`) |
| `docs/env-cloudflare-r2.md` | Все переменные R2, типовые ошибки, скрипты |
| `src/reports/README.md` | Краткая карта модуля отчётов |

## HTTP API: PdfSettings (префикс приложения: `/api`)

Маршрут вешается в `src/routes/index.js`: `router.use('/pfp/pdf-settings', pfpMiddleware, …)`, где `pfpMiddleware = [authMiddleware, tenantMiddleware]`.

| Метод | Путь | Назначение |
|--------|------|------------|
| GET | `/api/pfp/pdf-settings` | `editor_schema`, поля настроек, `cover_layout`, `date_preview` |
| PATCH | `/api/pfp/pdf-settings` | Частичное сохранение (`cover_background_url`, `cover_title`, `title_band_color`). Пустая строка сбрасывает к дефолту в БД |
| POST | `/api/pfp/pdf-settings/cover-background` | Multipart, поле **`image`**. Ключ R2: `pdf-report-covers/{projectId|common}/{agentId}/cover_{timestamp}{ext}` |
| GET | `/api/pfp/pdf-settings/cover-image` | URL для превью: прямой или подписанный (`R2_SIGN_COVER_URL`) |

Ответы с настройками включают **`editor_schema`** (контракт для ЛК) и **`cover_layout`** (геометрия + resolved цвета/текст). **Публичный URL фона нигде не дублируется:** только корневое поле **`cover_background_url`** (или **`GET /api/pfp/pdf-settings/cover-image`**, если нужен signed). Внутри `cover_layout.background` — лишь `uses_custom_upload` и `fallback_repo_relative_path` к стоковому jpg в репо, когда свой фон не задан.

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
- `npm run r2:migrate-url-prefix` — замена префикса URL в БД.
- `scripts/test_pdf_cover_upload.mjs` — ручной тест POST обложки (см. файл, JWT).

## Правила для агента (чтобы ничего не сломать)

1. **Новая страница отчёта** — по возможности отдельный модуль/спека + запись в этом skill (файлы, API, превью). Не плодить расхождения «HTML для PDF» vs «JSON для ЛК» без общей функции сборки.
2. **Обложка**: геометрия только через **`COVER_RENDER_SPEC`** / `buildCoverHtml.js`; **`cover_layout`** из тех же дефолтов/санитайзеров (`sanitizeTitleBandColor`).
3. **Дефолтный текст плашки** — **`GLOBAL_DEFAULTS.coverTitle`**; синхронизировать `openapi/PDFsettings.yaml` и миграции при смене.
4. Multipart для обложки — поле **`image`** (editor_schema + multer); для будущих загрузок — явно прописать в skill и схеме.
5. Публичные URL объектов в R2 — через **`uploadPublicFile`** / **`getPublicBaseCandidates`**, не собирать URL вручную.
6. **`cover_background_url`** и аналоги — полный URL в БД; смена env не чинит старые строки автоматически.

## Быстрый чеклист перед PR

- [ ] Если трогали отчёт — **обновлён этот skill** (новые страницы/эндпоинты/файлы).
- [ ] Обложка: `cover_layout` и HTML из одной спеки (`COVER_RENDER_SPEC`).
- [ ] Joi/валидация согласована с фронтом (для обложки — `#RRGGBB` плашки).
- [ ] R2: не ломаем `STORAGE_REQUIRE_R2`, 503-коды при ошибках, осмысленный фолбэк на диск.
- [ ] OpenAPI / `docs/env-cloudflare-r2.md` — если менялся контракт или поведение загрузок.

Дополнительно: `src/reports/README.md`.
