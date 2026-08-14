# ТЗ: агент IDE ↔ ЛК pfp-api без второго логина

**От:** IDE (`ide-api`, `ide.bank-future.com`)  
**Кому:** backend pfp-api (`pfp-api.bank-future.com`)  
**Дата:** 2026-08-14  
**Статус:** к реализации. `POST /api/auth/login` (email+пароль) **уже есть — не ломать.**

Фронт ЛК сейчас: после логина пишет `localStorage.token` и `localStorage.user`.  
SSO `consume` обязан вернуть **тот же JSON**, что `POST /api/auth/login`.

Публичная регистрация `POST /api/auth/register-agent` → OTP → `verify-agent-registration` **остаётся** для входа с витрины без IDE.

---

## Зачем

Консультант регистрируется один раз на **ide.bank-future.com** (сборка сайта).  
ЛК агента: `{live}/cabinet` → этот же pfp-api.

Нужно от pfp-api:

1. При регистрации в IDE создать того же агента **без второго письма с кодом** (OTP уже подтверждён в IDE).
2. Из кабинета IDE кнопка «Открыть ЛК» → сразу залогинен в `/cabinet`.

Обычный вход на `/cabinet` по email+пароль остаётся.

```
ide.bank-future.com  (сессия ide-api)
        │  service key, только server-to-server
        ▼
pfp-api.bank-future.com
        │  одноразовый ticket ≤ 60 с
        ▼
{live}/cabinet?sso_ticket=…  →  тот же JWT, что после /api/auth/login
```

Общий cookie **не подойдёт**: IDE = `ide.bank-future.com`, ЛК = `sites.athenis.ru/{name}/cabinet` или свой домен агента.

---

## 0. Письма OTP — не ваша задача

Код на почту при регистрации в IDE шлёт **ide-api** (Resend, отдельный `RESEND_FROM_FIN`, Афину не трогаем).

При `provision` с `email_verified: true` pfp-api **не** шлёт письмо и **не** зовёт существующий register-agent OTP.

---

## 1. Provision (регистрация из IDE)

Пользователь уже подтвердил email в IDE.

### `POST /api/internal/agents/provision`

```
Authorization: Bearer <PFP_IDE_SERVICE_KEY>
```

Только с ide-api (Immers). **Не** из браузера. Ключ новый, завести в `.env` pfp-api, отдать команде IDE (не в git).

Тело:

```json
{
  "email": "agent@mail.ru",
  "password": "plain-once",
  "first_name": "Виктор",
  "last_name": "Петров",
  "middle_name": "Иванович",
  "phone": "+79001234567",
  "region": "RU-MOW",
  "website_url": "https://sites.athenis.ru/finansovyy-konsultant-petrov-viktor/",
  "project_key": "pk_…",
  "email_verified": true,
  "source": "ide.bank-future.com"
}
```

`website_url` — публичный сайт агента из IDE (`live_url`: `sites.athenis.ru/{name}/` или свой домен).  
Писать в `agents.website_url` (уже есть в профиле / `PATCH /pfp/agents/{id}`).  
От этого поля уже строятся клиентские рефералки: `GET /pfp/agents/me/client-invite-link` → база = сайт агента + `?ref={referral_slug}` (не дефолтный `CLIENT_LANDING_BASE_URL`).

Если сайта ещё нет (черновик) — поле можно не слать или `null`. IDE пришлёт повторный provision после первой публикации (идемпотентно, пароль не трогать, `website_url` обновить).

`password` — один раз по HTTPS; хешировать **тем же** алгоритмом, что `/api/auth/login`.

**200:**

```json
{
  "ok": true,
  "created": true,
  "agent": { "id": 123, "email": "agent@mail.ru", "projectId": 1 }
}
```

| Правило | Поведение |
|---------|-----------|
| `email_verified: true` | сразу active, **без OTP** |
| тот же email + `project_key` | идемпотентно: 200, `created: false`; пароль **не** перетирать; ФИО/телефон/регион/`website_url` обновить |
| email занят в другом проекте | 409 `{ "error": "email_taken", "message": "…" }` |
| телефон занят в этом проекте | 409 `{ "error": "phone_taken", "message": "…" }` |
| неизвестный `project_key` | 400 |

После provision тот же email+пароль обязаны проходить существующий `POST /api/auth/login`.

`project_key` — публичный ключ проекта (как `x-project-key` / `VITE_PARTNER_PROJECT_KEY` на лендинге).

---

## 2. SSO: hop IDE → `/cabinet`

### 2.1 Выдать ticket (только ide-api)

`POST /api/internal/agents/sso-ticket`

```
Authorization: Bearer <PFP_IDE_SERVICE_KEY>
```

```json
{
  "email": "agent@mail.ru",
  "project_key": "pk_…",
  "return_path": "/cabinet"
}
```

Агента нет → **404** `{ "error": "agent_not_found" }` (IDE сначала сделает provision).

**200:**

```json
{
  "ticket": "одноразовый_секрет",
  "expires_in": 60
}
```

Ticket: одноразовый, TTL **60 секунд**, привязка `email` + `project_key`. Пароль в ticket **не** класть.

### 2.2 Погасить ticket (браузер ЛК)

Тот же CORS, что у `POST /api/auth/login`.

`POST /api/auth/sso/consume`

```json
{ "ticket": "…" }
```

**200 — как логин:**

```json
{
  "token": "<jwt агента>",
  "user": {
    "id": 123,
    "email": "agent@mail.ru",
    "role": "agent",
    "agentId": 123,
    "projectId": 1
  }
}
```

Просроченный / повторно использованный ticket → **400**, фронт показывает обычную форму логина.

Фронт `/cabinet` (делает команда IDE в шаблоне сайта):

1. Открыть `{live_url}/cabinet?sso_ticket=…`
2. `POST /api/auth/sso/consume`
3. Записать `localStorage.token` / `user`
4. Стереть query
5. Dashboard, не LoginPage

---

## 3. Профиль — `GET /api/auth/me`

Добавить / отдать, если ещё нет:

| Поле | Пример |
|------|--------|
| `first_name` | Виктор |
| `last_name` | Петров |
| `middle_name` | Иванович |
| `phone` | +79001234567 |
| `region` | `RU-MOW` (ISO 3166-2 RU) |
| `website_url` | `https://sites.athenis.ru/finansovyy-konsultant-petrov-viktor/` (сайт агента; рефералки клиентов) |

Логин email+пароль не менять.

---

## 4. Что делает IDE (не вы)

- Регистрация на ide.bank-future.com: ФИО, email, телефон, регион, пароль, OTP. Яндекс/VK там нет.
- После verify → ваш `provision`. Ошибка pfp-api не блокирует вход в IDE; ретрай при «Открыть ЛК».
- Как только сайт live — повторный `provision` с `website_url` = `live_url` (рефералки начинают вести на сайт агента, не на общий лендинг).
- Кнопка «Открыть ЛК»: ide-api берёт email из **своей** сессии → `sso-ticket` → редирект на `{live}/cabinet?sso_ticket=…`.
- Обработчик `sso_ticket` в шаблоне `/cabinet`.

Env на стороне IDE (Immers):

```
PFP_API_BASE_URL=https://pfp-api.bank-future.com
PFP_IDE_SERVICE_KEY=<выдаёте вы>
```

---

## 5. Безопасность

- `/api/internal/*` только service key. Не JWT IDE и не JWT агента.
- Ticket без пароля, one-shot, 60 с.
- ide-api в provision/sso передаёт только email залогиненного в IDE.
- CORS `sso/consume` = как у `/api/auth/login` (origin живого сайта агента).

---

## 6. Чеклист приёмки

- [ ] Регистрация на ide.bank-future.com → строка агента в pfp-api, **без** письма от pfp-api.
- [ ] `POST /api/auth/login` тем же email+паролем → 200, token.
- [ ] `sso-ticket` + `sso/consume` → тот же shape, что login; dashboard без формы.
- [ ] Повтор того же ticket → 400, не чужая сессия.
- [ ] Ticket старше 60 с → 400.
- [ ] Повторный provision того же email+project_key → 200, `created: false`.
- [ ] Старый `register-agent` + OTP с витрины по-прежнему работает.
