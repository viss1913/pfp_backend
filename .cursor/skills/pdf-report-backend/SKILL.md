---
name: pdf-report-backend
description: Documents backend PDF report cover (Figma-aligned HTML), per-agent pdf-settings API, Cloudflare R2, and DB/scripts. Use when changing PDF отчёт cover, /api/pfp/pdf-settings, buildCoverHtml, agent_report_pdf_settings, R2 uploads, or report preview layout in this repository.
---

# PDF-отчёт (обложка) — бэкенд PFP

## Когда включать этот skill

- Правки **первой страницы отчёта** (обложка): HTML, геометрия, градиенты, текст, фон.
- Эндпоинты **`/api/pfp/pdf-settings`**, загрузка фона, превью картинки.
- **Cloudflare R2**, переменные `R2_*`, публичные URL, миграция старых ссылок в БД.
- Таблица **`agent_report_pdf_settings`**, сиды/скрипты для обложек.

## Не смешивать с другим PDF в репозитории

- **`src/utils/pdfGenerator.js`** — PDFKit, **другой продукт** (home owners / лимиты страхования). К обложке отчёта PFP **не относится**.
- Обложка отчёта — это **`src/reports/cover/buildCoverHtml.js`** + **`pdfSettings*`** + R2.

## Архитектура (коротко)

1. **Один источник вёрстки обложки** — `COVER_RENDER_SPEC` и функции в `src/reports/cover/buildCoverHtml.js`. Отсюда же собираются HTML для PDF и payload превью для ЛК.
2. **Настройки на агента** — одна строка на `agent_id` в `agent_report_pdf_settings` (уникальный `agent_id`). Загрузка фона в ЛК обновляет **только этого агента**.
3. **URL фона** в БД хранится **целиком** (`cover_background_url`). Смена `R2_PUBLIC_*` в env **не переписывает** уже сохранённые строки — нужна новая загрузка, PATCH или скрипт миграции префикса.
4. **Загрузка файла**: браузер → `multipart`, поле **`image`** → бэк → `PutObject` в R2 под уникальным ключом → публичный URL → `upsert` в БД → ответ фронту.

## Ключевые файлы

| Файл | Роль |
|------|------|
| `src/reports/cover/buildCoverHtml.js` | Спека макета (`COVER_RENDER_SPEC`), `GLOBAL_DEFAULTS`, `buildReportCoverHtml`, `buildCoverLayoutPayload`, дата `formatCoverDateRu` (`REPORT_PDF_TZ` / `Europe/Moscow`) |
| `src/services/pdfSettingsService.js` | БД, `mergeWithDefaults`, `editor_schema`, `cover_layout`, `buildCoverHtmlForAgent`, signed URL для превью |
| `src/controllers/pdfSettingsController.js` | GET/PATCH, upload, `uploadPublicFile`, fallback на `uploads/` |
| `src/routes/pdfSettingsRoutes.js` | Multer: до 8 МБ, `image/jpeg`, `png`, `webp`; поле формы **`image`** |
| `src/utils/r2Client.js` | S3-клиент R2, `uploadPublicFile`, приоритет публичной базы: `R2_PUBLIC_BASE_URL` → `R2_CDN_BASE_URL` → `R2_PUBLIC_DOMAIN` |
| `openapi/PDFsettings.yaml` | Документация API (Swagger: `/api-docs-pdf-settings`) |
| `docs/env-cloudflare-r2.md` | Все переменные R2, типовые ошибки, скрипты |
| `src/reports/README.md` | Краткая карта модуля отчётов |

## HTTP API (префикс приложения: `/api`)

Все под `authMiddleware` + `tenantMiddleware` (JWT + проект).

| Метод | Путь | Назначение |
|--------|------|------------|
| GET | `/api/pfp/pdf-settings` | `editor_schema`, поля настроек, `cover_layout`, `date_preview` |
| PATCH | `/api/pfp/pdf-settings` | Частичное сохранение (`cover_background_url`, `cover_title`, `title_band_color`). Пустая строка сбрасывает к дефолту в БД |
| POST | `/api/pfp/pdf-settings/cover-background` | Multipart, поле **`image`**. Ключ R2: `pdf-report-covers/{projectId|common}/{agentId}/cover_{timestamp}{ext}` |
| GET | `/api/pfp/pdf-settings/cover-image` | URL для превью: прямой или подписанный (`R2_SIGN_COVER_URL`) |

Ответы с настройками включают **`editor_schema`** (контракт для ЛК) и **`cover_layout`** (геометрия + resolved цвета/текст). **Публичный URL фона нигде не дублируется:** только корневое поле **`cover_background_url`** (или **`GET /api/pfp/pdf-settings/cover-image`**, если нужен signed). Внутри `cover_layout.background` — лишь `uses_custom_upload` и `fallback_repo_relative_path` к стоковому jpg в репо, когда свой фон не задан.

## Почему в БД URL вида `…railway.app/uploads/pdf-report-covers/…`

Это **нормальный fallback**: файл ушёл на **диск контейнера** (`uploads/`), потому что при аплоаде не сработал R2 (нет переменных / ошибка PutObject). Ссылка рабочая для этого деплоя; для стабильного CDN — настроить R2 и перезалить. См. `docs/env-cloudflare-r2.md`, `STORAGE_REQUIRE_R2`.

## Cloudflare R2 — обязательно понимать

- После успешной загрузки публичный URL = **`bases[0]`** из env (первый непустой из `R2_PUBLIC_BASE_URL`, `R2_CDN_BASE_URL`, `R2_PUBLIC_DOMAIN`) + ключ объекта. Не дублировать логику на фронте.
- **`R2_ACCESS_KEY_ID`** — от R2 API Token, не Account ID.
- Endpoint без имени бакета в path (типично `https://<accountid>.r2.cloudflarestorage.com`).
- Если **`STORAGE_REQUIRE_R2=1`**, без R2 загрузка не уходит в диск — будет 503.
- Старые URL в БД после смены `pub-….r2.dev`: скрипт **`npm run r2:migrate-url-prefix`** (`R2_PUBLIC_URL_REPLACE_FROM`, опционально `R2_PUBLIC_URL_REPLACE_TO`, `DRY_RUN`).

Подробности и чеклисты: `docs/env-cloudflare-r2.md`.

## Скрипты (корень репо)

- `npm run r2:smoke` — проверка конфигурации R2 локально.
- `npm run seed:pdf-cover-default` — общий файл в R2 + заполнение `cover_background_url` агентам (опция `SEED_COVER_ONLY_EMPTY`).
- `npm run r2:migrate-url-prefix` — замена префикса URL в БД.
- `scripts/test_pdf_cover_upload.mjs` — ручной тест POST обложки (см. файл, JWT).

## Правила для агента (чтобы ничего не сломать)

1. **Не менять геометрию обложки** в одном месте и забыть про другое: правки макета — через **`COVER_RENDER_SPEC`** / функции в `buildCoverHtml.js`; `cover_layout` для API строится из тех же дефолтов/санитайзеров (`sanitizeTitleBandColor`).
2. **Дефолтный текст плашки** — только в **`GLOBAL_DEFAULTS.coverTitle`** в `buildCoverHtml.js`; затем синхронизировать `openapi/PDFsettings.yaml` и комментарии миграций при необходимости.
3. **Не переименовывать** поле multipart с файлами: остаётся **`image`** (и в `editor_schema`, и в multer).
4. **Не подставлять** сборку публичного URL вручную на бэке в обход `uploadPublicFile` / `getPublicBaseCandidates` — иначе расходится с подписанными URL и миграциями.
5. При работе с БД помнить: **`cover_background_url` хранит полный URL**; смена env не обновляет исторические строки.

## Быстрый чеклист перед PR

- [ ] Обложка и `cover_layout` по-прежнему из одного набора констант/функций.
- [ ] Joi/валидация в контроллере согласована с фронтом (`#RRGGBB` для плашки).
- [ ] R2: новые сценарии не ломают `STORAGE_REQUIRE_R2` и fallback (если он ещё нужен).
- [ ] Документация: при смене контракта API — `openapi/PDFsettings.yaml` и при необходимости `docs/env-cloudflare-r2.md`.

Дополнительно: `src/reports/README.md`.
