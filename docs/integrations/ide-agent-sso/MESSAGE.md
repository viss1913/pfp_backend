# Сообщение программисту (скопировать)

Привет.

Нужна связка **ide.bank-future.com** с нашим ЛК агента. ТЗ лежит здесь:

`docs/integrations/ide-agent-sso/TZ.md`

Кратко, **что делаешь ты (pfp-api)** и **что не твоё**.

---

**Твоё (бэк pfp-api):**

1. `POST /api/internal/agents/provision`  
   IDE уже подтвердил email. Создаёшь агента **без второго OTP/письма**. Тот же email+пароль должны логиниться в существующий `POST /api/auth/login`. Поля: ФИО, телефон, регион, **`website_url` (сайт агента из IDE)** , `project_key`. Идемпотентно.  
   `website_url` писать в уже существующее поле профиля — от него строятся рефералки (`client-invite-link`). После публикации IDE пришлёт URL ещё раз.

2. `POST /api/internal/agents/sso-ticket`  
   Только server-to-server, service key. Одноразовый ticket на 60 секунд (email + project_key).

3. `POST /api/auth/sso/consume`  
   Браузер ЛК. Ответ **как у `/api/auth/login`**: `{ token, user }`. Фронт кладёт в `localStorage` как сейчас.

4. `GET /api/auth/me` — отдать `first_name`, `last_name`, `middle_name`, `phone`, `region`.

5. Завести `PFP_IDE_SERVICE_KEY` в `.env` (не в git) и скинуть ключ команде IDE.

Логин email+пароль и `register-agent` с витрины **не ломать**.

---

**Не твоё (делает IDE):**

- Форма регистрации на ide.bank-future.com (почта, телефон, ФИО, регион).
- Письмо с кодом (Resend, отдельный From, Афину не трогаем).
- Кнопка «Открыть ЛК» и редирект на `{сайт}/cabinet?sso_ticket=…`.
- Обработчик query на фронте `/cabinet`.

---

Когда provision + sso-ticket + consume будут на стейдже — напиши URL и ключ, подключим ide-api.
