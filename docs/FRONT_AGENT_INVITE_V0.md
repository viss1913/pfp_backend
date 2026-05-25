# Фронт: приглашение субагента (v0)

Базовый фронт регистрации: [https://family-office.bank-future.com/](https://family-office.bank-future.com/) (канонический путь `/register/`).

Полный контракт API: [`docs/api/agent_lk.yaml`](api/agent_lk.yaml).

## Ссылка из письма / invite-link

Пример:

```text
https://family-office.bank-future.com/register/
  ?project_key=pk_...
  &ref=a1b2c3d4e5f6
  &utm_source=pfp
  &utm_medium=agent_invite_email
  &utm_campaign=subagent_register
  &utm_partner_finam=CM12345
```

| Query | Действие фронта |
|-------|-----------------|
| `project_key` | Сохранить → `register-agent.project_key` |
| `ref` | **Обязательно** сохранить (sessionStorage) → `register-agent.ref` → связь с пригласившим (`parent_agent_id`). Субагент тоже может звать своих, если в проекте `agent_network.max_depth` ≥ 2 |
| `utm_*` | Пробросить в body `register-agent` как одноимённые поля (рекомендуется) |
| `utm_partner_finam` | Только UTM / attribution; **не** писать в `partner_agent_id` нового агента. Если не передать в body, но есть `ref` — бэк подставит Finam ID куратора сам |

## Регистрация шаг 1

```http
POST /api/auth/register-agent
Content-Type: application/json

{
  "email": "new@example.com",
  "project_key": "pk_...",
  "first_name": "Иван",
  "last_name": "Иванов",
  "phone": "+79001234567",
  "ref": "a1b2c3d4e5f6",
  "utm_source": "pfp",
  "utm_medium": "agent_invite_email",
  "utm_campaign": "subagent_register",
  "utm_partner_finam": "CM12345",
  "partner_agent_id": "OWN_FINAM_ID"
}
```

`partner_agent_id` — **свой** Finam ID нового агента (опционально на v0).  
`ref` без значения из URL — субагент **не привяжется** к пригласившему.

Ответ `200`: `{ message, email, expires_in_minutes }` → экран ввода кода.

## Шаг 2 (UI можно позже)

`POST /api/auth/verify-agent-registration` — `{ email, code, password }` → JWT и поля профиля (как `GET /auth/me`).

## После verify / auth/me: ссылка на Finam

| Поле | Назначение фронта |
|------|-------------------|
| `finam_agent_registration_url` | Кнопка «Зарегистрироваться агентом Финама». База: `https://broker.finam.ru/landing/agent/`. Если пришёл по `ref` и у куратора есть Finam ID — URL с `utm_partner_finam` куратора |
| `finam_agent_referral_url` | Своя реферальная на Finam; `null`, пока нет `partner_agent_id` |
| `has_partner_full_access` | `false` → ограничить ЛК / wizard Finam ID |
| `effective_partner_agent_id` | ID для UTM (свой или куратора после skip) |
| `partner_agent_id_mode` | `own` \| `parent_inherited` \| null |

Wizard: `POST /api/pfp/agents/me/partner-id-wizard` — `action: set` (свой ID) или `action: skip` (наследовать Finam ID куратора, без записи в `partner_agent_id`).

Env бэкенда (опционально): `FINAM_AGENT_LANDING_URL`.

## API для куратора в ЛК

| Метод | Назначение |
|-------|------------|
| `GET /api/pfp/agents/me/invite-link` | Скопировать ссылку |
| `POST /api/pfp/agents/me/subagent-invite/send-email` | `{ "to_email", "recipient_name"? }` |
| `GET /api/pfp/agents/me/subagents` | Список привлечённых после регистрации |

## Env бэкенда

```env
AGENT_REGISTER_BASE_URL=https://family-office.bank-future.com/register/
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
```
