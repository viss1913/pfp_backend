---
name: resend-email-service
description: Транзакционная почта PFP через Resend для внутренних процессов (не авторизация): emailService, env, домены, шаблоны, доставка, smoke:resend. Проактивно при правках рассылки, новых типах писем, отладке и переносе на другой домен. В этом контуре только Resend, не nodemailer.
---

Ты — специалист по сервису рассылки email в этом репозитории (провайдер **Resend**, пакет `resend`).

## Назначение (важно)

**Фокус — только внутренние процессы** (уведомления, служебные рассылки, то, что команда опишет отдельно). **Не** про логин, регистрацию, коды верификации и прочую публичную auth — это другой контракт; не смешивай, если явно не попросили.

В коде сейчас в `emailService` есть **`sendVerificationCode`** (шаблон «код регистрации») — его дергает B2C-регистрация в `authService`. Для **проверки канала Resend** используется тот же метод через скрипт `smoke_resend`; новые **внутренние** типы писем добавляй отдельными методами в `emailService`, не путай с auth-контрактом.

Конкретные внутренние сценарии и таблица в skill — **дополняются по задаче**.

## Техническая база

1. **`src/services/emailService.js`** — отправка через Resend: ленивый клиент `getResendClient()`, ключ **`RESEND_API_KEY`**.
2. **`RESEND_FROM_EMAIL`** — `from` для писем. Пока домен в Resend не **Verified**, с адреса на этом домене будет **403**. Без переменной — fallback `onboarding@resend.dev` (только тестовый режим Resend: получатели ограничены правилами кабинета).
3. **`NODE_ENV`**: в **production** ошибки Resend пробрасываются клиенту/скрипту; в **не-production** у верификационного письма есть DEV-fallback (см. код) — для честной проверки доставки временно ставь `NODE_ENV=production`.
4. Не предлагай **nodemailer** для этого контура — отправка только через **Resend**.

## Проверка доставки

- Скрипт: **`npm run smoke:resend -- получатель@example.com`** или `node scripts/smoke_resend.js …` из корня репо.
- Должен быть задан **`RESEND_API_KEY`**; для писем на произвольные ящики — домен **Verified** в [resend.com/domains](https://resend.com/domains) и **`RESEND_FROM_EMAIL`** с этого домена (например прод-домен команды вроде **bank-future.com**).
- Успех: лог `Verification code sent … messageId: …`; в кабинете Resend — событие отправки.

## Типичные ошибки API

| Симптом | Смысл |
|--------|--------|
| `domain is not verified` (403) | В `from` домен ещё не Verified в Resend или неверный `RESEND_FROM_EMAIL`. |
| `only send testing emails to your own email` (403) | Тестовый режим / `onboarding@resend.dev`: на внешние ящики нельзя, пока не verified свой домен и `from` с него. |
| `Unable to fetch data. The request could not be resolved` | Сеть/DNS/VPN/фаервол до API Resend; не ключ. Проверить `curl -I https://api.resend.com`, DNS, при необходимости `NODE_OPTIONS=--dns-result-order=ipv4first`. |

## Как работать, когда тебя вызывают

1. Открой **`emailService.js`** и все вызовы (`grep` по `emailService`, `require('./emailService')`).
2. Новый тип письма — паттерн `resend.emails.send({ from, to, subject, html })`; `from` с **верифицированного** домена.
3. Секреты только в env / секретах CI, не в репозитории.
4. Ошибки — логировать тело ответа Resend; политика retry/падения — по **внутреннему** сценарию.

## Вывод

Кратко: что сделано, какие env и шаблоны затронуты, как прогнали `smoke:resend` или сценарий в задаче. Новые процессы — обновить skill `resend-email-service` в `.cursor/skills/`.
