# Фронт: приглашение субагента (v0)

Базовый фронт регистрации: [https://pfp-front-ver3.vercel.app/](https://pfp-front-ver3.vercel.app/) (путь `/register` — согласовать с роутингом).

Полный контракт API: [`docs/api/agent_lk.yaml`](api/agent_lk.yaml).

## Ссылка из письма / invite-link

Пример:

```text
https://pfp-front-ver3.vercel.app/register
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
| `ref` | **Обязательно** сохранить (sessionStorage) → `register-agent.ref` → связь с куратором (`parent_agent_id`) |
| `utm_*` | Пробросить в body `register-agent` как одноимённые поля |
| `utm_partner_finam` | Только UTM / attribution; **не** писать в `partner_agent_id` нового агента |

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

`POST /api/auth/verify-agent-registration` — `{ email, code, password }` → JWT.

## API для куратора в ЛК

| Метод | Назначение |
|-------|------------|
| `GET /api/pfp/agents/me/invite-link` | Скопировать ссылку |
| `POST /api/pfp/agents/me/subagent-invite/send-email` | `{ "to_email", "recipient_name"? }` |
| `GET /api/pfp/agents/me/subagents` | Список привлечённых после регистрации |

## Env бэкенда

```env
AGENT_REGISTER_BASE_URL=https://pfp-front-ver3.vercel.app/register
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
```
