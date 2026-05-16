---
name: resend-email-service
description: Транзакционная почта PFP через Resend для внутренних процессов (не auth): emailService, env, домен Verified, smoke:resend, шаблоны. Использовать при правках рассылки, новых письмах, переносе домена и ключей. Дополнять skill при появлении внутренних сценариев и вызовов.
---

# Resend и emailService — внутренние процессы

## Назначение

Один провайдер (**[Resend](https://resend.com)**), в коде — **`src/services/emailService.js`**. Транзакционные письма через API, не свой SMTP. Пакет: **`resend`**.

**Этот skill не про авторизацию** как продуктовую зону: регистрация/коды для ЛК — отдельный контракт. Здесь — **внутренние процессы** и инфраструктура почты. Факт: в репо уже есть **`sendVerificationCode`** и HTML шаблон; вызывается из **`authService`** (B2C регистрация). Новые служебные письма — расширять `emailService`, таблицу сценариев ниже.

**Важно:** `nodemailer` в проекте может быть, но **в этом контуре** отправка через **Resend**.

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `RESEND_API_KEY` | API-ключ (**обязателен**). В CI/хостинге — только секреты. |
| `RESEND_FROM_EMAIL` | `from`, например `Имя <noreply@bank-future.com>`. Должен быть адрес с домена в статусе **Verified** в кабинете Resend. Без переменной — в коде fallback `onboarding@resend.dev` (ограничения тестового режима по доке Resend). |

Шаблон переменных: **`.env.example`** (блок Resend).

## Настройка домена

1. Resend → **Domains** → DNS (SPF, DKIM и т.д.) → статус **Verified**.
2. API key → `RESEND_API_KEY`.
3. `RESEND_FROM_EMAIL` — с **этого же** верифицированного домена (иначе 403).

Прод-командный домен для почты в текущей связке — **bank-future.com** (проверять в кабинете Resend, не в коде).

## Проверка доставки

```bash
# из корня backend; для честных ошибок API без DEV-fallback см. emailService
NODE_ENV=production node scripts/smoke_resend.js получатель@example.com
```

Windows PowerShell:

```powershell
$env:NODE_ENV = "production"
node scripts/smoke_resend.js получатель@example.com
```

Или: **`npm run smoke:resend -- получатель@example.com`**

Успех: лог `[EmailService] Verification code sent … messageId: …`. Скрипт гоняет тот же **`sendVerificationCode`**, что и живой код (удобно проверить ключ + домен + DNS).

## Типичные ошибки

| Ответ | Действие |
|--------|----------|
| 403, domain not verified | Дождаться Verified, поправить `RESEND_FROM_EMAIL` на домен из Resend. |
| 403, only testing to own email | Тестовый `from` или нет verified домена; либо слать на разрешённый ящик, либо завершить верификацию домена. |
| `Unable to fetch data… resolved` | Проблема сети/DNS до `api.resend.com` (VPN, фаервол, DNS). Не связано с ключом. |

В **не-production** у ошибок отправки кода верификации см. DEV-fallback в **`emailService.js`**.

## Паттерн в коде

- Расширение **`emailService`**: `getResendClient().emails.send({ from, to, subject, html })`.
- `from`: `process.env.RESEND_FROM_EMAIL` или общий хелпер — как в существующем файле.
- Секреты и ключи не логировать.

## Внутренние сценарии (заполнять по мере появления)

| Сценарий | Триггер | Метод / файл | Примечание |
|----------|---------|--------------|------------|
| Код регистрации агента (ЛК) | `POST /api/auth/register-agent` | `EmailService.sendVerificationCode(email, code, { purpose: 'agent' })` | From: `getVerificationFrom()` → `noreply@domain` при шаблоне `{agent}@…` в `RESEND_FROM_EMAIL` |
| Приглашение субагента | `POST /api/pfp/agents/me/subagent-invite/send-email` | `EmailService.sendSubagentInviteEmail` | From/Reply-To как NDA (имя агента + `{agent}` mailbox) |
| Код регистрации B2C-клиента | `POST /api/auth/register-client` | `sendVerificationCode(…, { purpose: 'client' })` | Тот же шаблон письма |
| Подушка безопасности (Сбер) | Клик в ЛК агента `POST /api/pfp/clients/{id}/life-insurance/send-email` | `EmailService.sendSberLifeOfferEmail` / `src/services/emailService.js` | HTML-письмо (зелёная тема, лого Сбера, CTA «Оформить НСЖ») |

## Ключевые файлы

| Файл | Роль |
|------|------|
| `src/services/emailService.js` | Resend; верификация, **NDA с вложением PDF** (`sendNdaPdfEmail`) |
| `scripts/smoke_resend.js` | Дымовая отправка |
| `package.json` | скрипт `smoke:resend` |

После новых типов писем — **дописать таблицу сценариев** и при необходимости `.env.example`.
