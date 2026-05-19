# Фронт: Family Office invite (magic-link)

Спека API: [`docs/api/agent_lk.yaml`](api/agent_lk.yaml).

## Режимы онбординга агента / Family Office

| Режим | API | UX |
|-------|-----|-----|
| Саморегистрация субагента | `POST /auth/register-agent` | Ссылка на `/register`, код на email |
| Приглашение субагента (письмо) | `POST .../subagent-invite/send-email` | Ссылка на `/register` |
| **FO от куратора** | `POST .../family-office-invite` | Куратор → magic-link → `/invite/activate` |
| **FO с сайта (сам)** | `POST /auth/register-family-office` | См. [`FRONT_FAMILY_OFFICE_SELF_REGISTER.md`](FRONT_FAMILY_OFFICE_SELF_REGISTER.md) |

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

Если `has_partner_full_access === false` — wizard Finam ID:

| Действие | API |
|----------|-----|
| Ввести свой ID | `POST /api/pfp/agents/me/partner-id-wizard` `{ "action": "set", "partner_agent_id": "…" }` или `partner_ref_url` |
| Пропустить (ID куратора для UTM) | `{ "action": "skip" }` — только если есть `parent_agent_id` и у куратора есть Finam ID |
| Альтернатива | `PATCH /api/pfp/agents/{agentId}` с `partner_agent_id` |

После wizard — смотреть `GET /api/auth/me`: `effective_partner_agent_id`, `partner_agent_id_mode` (`own` | `parent_inherited`).

## Env бэкенда

```env
AGENT_INVITE_ACTIVATE_BASE_URL=https://pfp-front-ver3.vercel.app/invite/activate
AGENT_INVITE_TOKEN_TTL_DAYS=7
```
