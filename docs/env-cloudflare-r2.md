# Cloudflare R2 (хранение картинок)

Бэкенд использует **S3-совместимый API** R2 (`@aws-sdk/client-s3`).

## Обязательные переменные для загрузки

| Переменная | Назначение |
|------------|------------|
| `R2_BUCKET_NAME` | Имя бакета |
| `R2_ACCESS_KEY_ID` | Ключ API |
| `R2_SECRET_ACCESS_KEY` или `SecretAccessKey` | Секрет |
| `R2_ACCOUNT_ID` | Аккаунт Cloudflare **или** задайте `R2_ENDPOINT` / `S3_API_URL` полным URL эндпоинта S3 |

Эндпоинт по умолчанию: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

## Публичные URL после загрузки

**Обязательно до выдачи ссылки:** задай хотя бы одну переменную ниже. Иначе бэк не сможет собрать URL после успешного `PutObject` и уйдёт в фолбэк на диск (или 503 при `STORAGE_REQUIRE_R2`).

Публичная отдача файла — через **Custom Domain** к бакету, **R2.dev Public URL** из дашборда или отдельный CDN (не через `x-amz-acl`: R2 ACL не используем в коде).

После `PutObject` клиенту нужен **публичный** URL:

| Переменная | Назначение |
|------------|------------|
| `R2_PUBLIC_BASE_URL` | Полный префикс, **без слэша в конце**. Примеры: `https://cdn.example.com`, **`https://pub-xxxxxxxx.r2.dev`** (то, что Cloudflare показывает как *Public Development URL* для бакета) |
| `R2_CDN_BASE_URL` | Запасной вариант базы |
| `R2_PUBLIC_DOMAIN` | Хост без схемы (`pub-….r2.dev` или `cdn.example.com`) — в коде станет `https://…` |

Хотя бы одна из них нужна, иначе загрузка в R2 вернёт ошибку конфигурации (или фолбэк на диск, см. ниже).

### Важно про `pub-….r2.dev`

- Значение **должно совпадать** с тем **Public Development URL**, который Cloudflare выдал **именно этому бакету**. Другой `pub-…` (от другого бакета/аккаунта) даст **404** при открытии ссылки.
- В БД часто лежат **уже сохранённые абсолютные URL**. Если ты поменяла только `R2_PUBLIC_BASE_URL` на Railway, **старые ссылки в ответах API не обновятся сами** — нужна новая загрузка / `PATCH` / массовая замена префикса в `cover_background_url`.
- Если картинка **не грузится в браузере** с фронта (в Network — blocked / CORS): в R2 для бакета включи публичный доступ и при необходимости настрой **CORS** (разрешить origin фронта и метод `GET` для `pub-….r2.dev`).

### Сменили `pub-….r2.dev`, в API всё ещё старые ссылки и 404

1. В Railway выставь **новый** `R2_PUBLIC_BASE_URL` или `R2_PUBLIC_DOMAIN` (тот, что в дашборде у **этого** бакета).
2. В БД остаются **старые абсолютные URL**. Замена префикса:

```bash
# в .env уже новый R2_PUBLIC_*; указать старый хост, который сейчас в БД:
set R2_PUBLIC_URL_REPLACE_FROM=https://pub-f7e229b86c1940fabdcf50f072f1013a.r2.dev
# опционально: DRY_RUN=1 npm run r2:migrate-url-prefix
npm run r2:migrate-url-prefix
```

Скрипт правит `agent_report_pdf_settings.cover_background_url` и `ai_b2c_settings.avatar_url`.

## Опционально

| Переменная | Назначение |
|------------|------------|
| `STORAGE_REQUIRE_R2` | `1` / `true` — **не** писать загрузки на локальный диск; без R2 — `503` с `STORAGE_R2_REQUIRED` |
| `R2_SIGN_COVER_URL` | `1` / `true` — `GET /api/pfp/pdf-settings/cover-image` отдаёт **подписанный** временный URL (если `cover_background_url` распознан как объект под вашим `R2_PUBLIC_*`) |
| `R2_SIGNED_URL_TTL_SEC` | TTL подписи в секундах (по умолчанию `900`) |

## Где используется

- `POST /api/pfp/ai-b2c/avatar-upload` — аватар ассистента → R2 ключ `ai-b2c-avatars/...`
- `POST /api/pfp/pdf-settings/cover-background` — фон обложки → `pdf-report-covers/{projectId}/{agentId}/...`

Чтение для ЛК: **`GET /api/pfp/pdf-settings/cover-image`** (прямой или signed URL).

Серверные утилиты: `src/utils/r2Client.js` (`getObjectBuffer`, `getSignedGetObjectUrl`, `deleteObjectByKey`).

## Локальная проверка без Railway

Скопируй в корневой `.env` те же переменные, что на Railway, затем из корня репозитория:

```bash
npm run r2:smoke
```

Скрипт печатает, чего не хватает, делает `PutObject` в ключ `diagnostics/r2-smoke-*.txt` и удаляет его (если не задано `R2_SMOKE_KEEP=1`).

На Railway в логах деплоя при ошибках смотри строки **`[R2] PutObject failed:`** и предупреждение про **`R2_PUBLIC_*`**.

## Массовый дефолтный фон обложки

Один файл в R2 (`pdf-report-covers/_shared/default-cover.*`) и запись **`cover_background_url` всем агентам** (таблица `agent_report_pdf_settings`):

```bash
npm run seed:pdf-cover-default
```

Только у кого ещё нет своего URL: `SEED_COVER_ONLY_EMPTY=1 npm run seed:pdf-cover-default`
