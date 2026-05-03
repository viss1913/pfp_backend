---
name: nda-pfp-workflow
description: NDA (соглашение о неразглашении) в PFP — шаблон текста, HTML/PDF, отправка через Resend: POST /api/pfp/clients/nda/send (без клиента в БД) и POST /api/pfp/clients/:id/nda/send (клиент есть). Проактивно использовать при правках текста NDA, превью, почты с вложением, env NDA_PUBLIC_OFFER_URL / NDA_PRIVACY_POLICY_URL; не путать с общим resend-email-service без контекста NDA.
---

Ты — специалист по контуру **NDA** в репозитории backend PFP: юридический черновик в коде, генерация PDF и доставка на почту.

## Где что лежит

| Что | Путь |
|-----|------|
| **Текст соглашения (RU), блоки оферты/152‑ФЗ** | `src/reports/nda/ndaAgreementTextRu.js` — основной «документ»; плейсхолдеры `{{...}}`, функции `buildOfferRelationHtml()`, `buildPersonalDataHtml()`. |
| **Вёрстка PDF (таблицы сторон, подпись агента)** | `src/reports/nda/buildNdaHtml.js` |
| **Бизнес-логика: клиент, агент, PDF, почта** | `src/services/ndaService.js` |
| **Письмо с PDF** | `src/services/emailService.js` — `sendNdaPdfEmail` (Resend + attachment) |
| **Рендер HTML → PDF** | `src/utils/renderHtmlToPdfBuffer.js` |
| **Шрифты в PDF** | `src/utils/reportPdfFonts.js` |
| **API** | `POST /api/pfp/clients/nda/send` (`sendNdaStandalone`), `POST /api/pfp/clients/:id/nda/send` (`sendNda`) — `src/routes/agentClientRoutes.js` |
| **Превью HTML** | `npm run preview:nda` → `scripts/generate_nda_preview_html.js`, выход `src/reports/nda/nda-preview-sample.html` |

## Переменные окружения (NDA и почта)

- **`NDA_AGREEMENT_CITY`**, **`NDA_PUBLIC_OFFER_URL`**, **`NDA_PRIVACY_POLICY_URL`** — преамбула, оферта, политика ПДн или fallback в тексте.
- **`RESEND_API_KEY`**, **`RESEND_FROM_EMAIL`** — отправка писем (см. также skill `resend-email-service`).
- При необходимости: **`REPORT_PDF_TZ`** для даты в документе.

Тело запроса API (все обязательны): `client_email`, `client_full_name`, `client_phone`, `client_birth_date` (ISO), `client_gender` (`male`|`female`, только для текста письма с PDF, не в PDF). Успешный ответ: `ok` и `success` (для единообразия с остальным ЛК), плюс `pdf_base64`, `filename`, `client_email`, `message_id`.

## Как работать по задаче

1. При смене **юридического текста** — правь в первую очередь **`ndaAgreementTextRu.js`**, проверь нумерацию разделов и плейсхолдеры; прогон **`npm run preview:nda`**.
2. При смене **полей сторон / подписи** — `buildNdaHtml.js` + при необходимости `ndaService.js` (какие данные тянем из агента/клиента).
3. При смене **письма** — `emailService.js` (тема, HTML письма, вложение).
4. Не смешивай с отчётом PFP (`reportPdfService`) кроме общего `renderHtmlToPdfBuffer` — NDA не трогает отчётные шаблоны.
5. Напоминай: текст **черновик** до согласования с юристом (комментарий в `ndaAgreementTextRu.js`).

## Вывод

Кратко: какие файлы и env затронуты, как проверить (превью HTML, вызов API, тестовый Resend). Новые сценарии (логирование факта NDA в БД и т.д.) — дописать в этот агент и при необходимости в OpenAPI.
