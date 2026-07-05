# Family Office B2C — фронт (чеклист MVP)

Бэкенд-контракт: [`docs/api/b2c_lk.yaml`](api/b2c_lk.yaml), [`docs/api/agent_lk.yaml`](api/agent_lk.yaml).

## Поток (рекомендуемый)

```
/?ref=XXX&project_key=pk
  → sessionStorage: ref, utm, project_key
  → GET /auth/client-referral/preview (имя агента на лендинге)
  → /plan (guest CJM, без логина)
  → GET /client/risk-profile/questionnaire-v2
  → POST /client/risk-profile/evaluate (опционально)
  → POST /client/calculate (client.risk_profile_answers в теле)
  → Result + «Сохранить план»
  → POST /client/plan/save { ...тот же payload..., ref, client.email }
  → guest_token в ответе → Bearer на /my/plan/report/html и /pdf
  → (опционально позже) register-client → verify-code — заклеймить аккаунт
```

## Задачи фронта

| Задача | API |
|--------|-----|
| Публичный маршрут CJM | `/?ref=` → `/plan`, не `FamilyOfficeSelfRegisterModal` |
| Захват ref/UTM | `sessionStorage` при заходе по ссылке |
| Preview агента | `GET /api/auth/client-referral/preview?ref=&project_key=` |
| Риск в CJM | `GET /api/client/risk-profile/questionnaire-v2` + `POST .../evaluate` |
| Гостевой расчёт | `POST /api/client/calculate` + `x-project-key` |
| **Сохранить план (без пароля)** | `POST /api/client/plan/save` + `ref` + `client.email` |
| Отчёт после save | `Authorization: Bearer {guest_token}` → `GET /api/my/plan/report/html` |
| Регистрация (опционально) | `POST /api/auth/register-client` → `verify-code` — линкует лид |
| ЛК агента | `GET /api/pfp/agents/me/client-invite-link` — кнопка «Пригласить клиента» |

## Заголовки

- Публичные guest-эндпоинты: `x-project-key: {project_key}` (как у `/client/calculate`).
- Отчёты после save: `Authorization: Bearer {guest_token}`.

## CRM агента

Клиент с `ref` при `plan/save` попадает в CRM (`GET /pfp/clients`) как **лид** (`registration_status: lead`, `user_id` пустой).
После `verify-code` — `registration_status: registered`. `take-over` не нужен.
