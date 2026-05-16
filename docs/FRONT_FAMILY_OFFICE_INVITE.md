# Фронт: Family Office invite (magic-link)

Спека API: [`docs/api/agent_lk.yaml`](api/agent_lk.yaml).

## Два режима приглашения субагента

| Режим | API | UX |
|-------|-----|-----|
| Саморегистрация | `POST .../subagent-invite/send-email` | Ссылка на `/register`, код на email |
| **Family Office** | `POST .../family-office-invite` | Куратор заполняет анкету → письмо с magic-link → `/invite/activate` |

## Куратор: форма приглашения

```http
POST /api/pfp/agents/me/family-office-invite
Authorization: Bearer …
Content-Type: application/json

{
  "email": "ivan@example.com",
  "first_name": "Иван",
  "last_name": "Иванов",
  "phone": "+79001234567",
  "birth_date": "1985-03-15",
  "gender": "male",
  "source_note": "Демо ПФП 16.05"
}
```

Ответ `201`: `{ message, agent_id, email, expires_at }` — **без** token и пароля.

Поля можно подставлять из карточки клиента / first-run (те же имена, что у клиента).

## Субагент: активация

1. Письмо → `https://pfp-front-ver3.vercel.app/invite/activate?token=…`
2. Страница activation:
   - `GET /api/auth/agent-invite/preview?token=…` — показать email/имя, проверить `valid`
   - Форма: пароль (+ повтор)
   - `POST /api/auth/activate-agent-invite` `{ token, password }` → `{ token: JWT, user }`
3. Редирект в ЛК с JWT.

## Гейт Finam ID

После входа: `GET /api/auth/me`

Если `partner_agent_id_required === true` и `partner_agent_id` пустой — full-screen wizard (PATCH `/api/pfp/agents/{agentId}` с Finam ID или `partner_ref_url`).

## Env бэкенда

```env
AGENT_INVITE_ACTIVATE_BASE_URL=https://pfp-front-ver3.vercel.app/invite/activate
AGENT_INVITE_TOKEN_TTL_DAYS=7
```
