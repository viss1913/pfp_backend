# Фронт: саморегистрация Family Office (сайт)

Публичный сценарий: агент сам заходит на лендинг, заполняет анкету, подтверждает email кодом, задаёт пароль и попадает в ЛК как владелец своего Family Office (без куратора и без magic-link).

Спека API: [`docs/api/agent_lk.yaml`](api/agent_lk.yaml) — `POST /auth/register-family-office`, `POST /auth/verify-family-office-registration`.

## Три режима онбординга агента

| Режим | API | UX |
|-------|-----|-----|
| Субагент по ref | `POST /auth/register-agent` | `/register?ref=…`, код на email |
| FO от куратора | `POST /pfp/agents/me/family-office-invite` | Куратор → magic-link → `/invite/activate` |
| **FO с сайта (сам)** | `POST /auth/register-family-office` | Лендинг FO → код на email → пароль → JWT |

## Шаг 0 — выбор проекта

На лендинге пользователь выбирает, **в каком проекте** открыть FO (Финам, АТБ и т.д.). В шаг 1 передаётся `project_key` (`pk_…`) выбранного проекта.

Список `pk_…` — на фронте (конфиг/хардкод). Бэкенд может дополнительно ограничить проекты env `FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS` (через запятую, numeric `project_id`).

## Шаг 1 — анкета + код на почту

```http
POST /api/auth/register-family-office
Content-Type: application/json

{
  "email": "ivan@example.com",
  "first_name": "Иван",
  "last_name": "Иванов",
  "middle_name": "Иванович",
  "phone": "+79001234567",
  "gender": "male",
  "project_key": "pk_…",
  "utm_source": "landing",
  "utm_medium": "family_office_self_register",
  "utm_campaign": "open_family_office"
}
```

**Обязательные поля:** `email`, `first_name`, `last_name`, `phone`, `gender`, `project_key`.

`gender`: `male` | `female` (также `M` / `F` / `мужской` / `женский`).

Ответ `200`:

```json
{
  "message": "Код подтверждения отправлен на вашу почту",
  "email": "ivan@example.com",
  "expires_in_minutes": 10
}
```

Пароль на шаге 1 **не** передаётся. Код — **6 цифр**, письмо через Resend (как у `register-agent`).

## Шаг 2 — код + пароль → JWT

```http
POST /api/auth/verify-family-office-registration
Content-Type: application/json

{
  "email": "ivan@example.com",
  "code": "123456",
  "password": "secret123"
}
```

Ответ `201` — как у `verify-agent-registration`: `token`, `user`, поля профиля агента.

## После входа

- `parent_agent_id` = `null` (самостоятельный FO, не субагент).
- **Платформенный Finam ID** (Railway env `PFP_MAIN_FINAM_AGENT_ID`, алиас в переписке — `id_main_finam`):
  - не пишется в `agents.partner_agent_id` (unique per project);
  - используется как `effective_partner_agent_id` для отчётов, «открыть счёт», bonus.finam и т.д.;
  - `GET /auth/me`: `partner_agent_id_mode` = `platform_default`, `has_partner_full_access` = `true` (wizard не блокирует ЛК).
- Wizard Finam ID (`POST /api/pfp/agents/me/partner-id-wizard`) **опционален** — только если агент хочет подставить **свой** Finam ID вместо платформенного.

## Блок рынка на лендинге (гость)

Публичный снимок макро, те же цифры что в ЛК агента, **без логина** (ПДн нет):

```http
GET /api/pfp/macro/public-latest
```

Алиас: `GET /api/pfp/macro/latest` — тоже без Bearer / API key.
CORS: `Access-Control-Allow-Origin: *`, методы GET, OPTIONS.

Сайт консультанта может ходить напрямую или через ide-api `GET /public/macro-pulse`.

Стабильные slug:

| Показатель | slug |
|---|---|
| Ключевая ставка ЦБ РФ | `cbr_key_rate` |
| Инфляция (ИПЦ г/г, не Росстат) | `russia_cpi_inflation_yoy` |
| Макс. ставка по вкладам топ-10 (ЦБ) | `cbr_deposit_rate_max` |
| Доходность ОФЗ G-кривая 5 лет | `moex_ofz_gcurve_5y` |
| Индекс МосБиржи IMOEX | `moex_imoex` |
| Курс USD/RUB ЦБ РФ | `usd_rub` |

## Env бэкенда (Railway)

```env
PFP_MAIN_FINAM_AGENT_ID=CM123456
# FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS=14,28
```

## Отличие от `register-agent`

| | `register-agent` | `register-family-office` |
|--|------------------|---------------------------|
| ref / куратор | опционально `ref` → `parent_agent_id` | нет |
| Пол | нет | **обязателен** |
| ФИО / телефон | опционально | **обязательны** имя, фамилия, телефон |
| `require_invite_ref` в проекте | может блокировать | **не** применяется |
| purpose в БД | `agent_register` | `family_office_self_register` |
| Finam UTM без своего ID | только через ref/skip куратора | `platform_default` из env |
