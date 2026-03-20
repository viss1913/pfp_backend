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

После `PutObject` клиенту нужен **публичный** URL (Custom Domain / R2.dev / CDN):

| Переменная | Назначение |
|------------|------------|
| `R2_PUBLIC_BASE_URL` | Напр. `https://cdn.example.com` (без слэша в конце) |
| `R2_CDN_BASE_URL` | Запасной вариант базы |
| `R2_PUBLIC_DOMAIN` | Домен без схемы — будет `https://...` |

Хотя бы одна из них нужна, иначе загрузка в R2 вернёт ошибку конфигурации (или фолбэк на диск, см. ниже).

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
