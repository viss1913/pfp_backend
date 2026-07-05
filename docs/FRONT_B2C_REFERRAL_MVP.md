# Family Office B2C — фронт (чеклист MVP)

Бэкенд-контракт: [`docs/api/b2c_lk.yaml`](api/b2c_lk.yaml), [`docs/api/agent_lk.yaml`](api/agent_lk.yaml).

## Поток

```
/?ref=XXX&project_key=pk
  → sessionStorage: ref, utm, project_key
  → GET /auth/client-referral/preview (имя агента на лендинге)
  → /plan (guest CJM, без логина)
  → GET /client/risk-profile/questionnaire-v2
  → POST /client/risk-profile/evaluate (опционально, показать профиль)
  → POST /client/calculate (client.risk_profile_answers в теле)
  → Result + «Сохранить»
  → POST /auth/register-client { email, name, project_key, ref }
  → POST /auth/verify-code { email, code, password }
  → POST /my/plan/first-run (тот же payload из localStorage)
```

## Задачи фронта

| Задача | API |
|--------|-----|
| Публичный маршрут CJM | `/?ref=` → `/plan`, не `FamilyOfficeSelfRegisterModal` |
| Захват ref/UTM | `sessionStorage` при заходе по ссылке |
| Preview агента | `GET /api/auth/client-referral/preview?ref=&project_key=` |
| Риск в CJM | `GET /api/client/risk-profile/questionnaire-v2` + `POST .../evaluate` |
| Гостевой расчёт | `POST /api/client/calculate` + `x-project-key` |
| Сохранить план | модалка регистрации на Result |
| authApi | `registerClient`, `verifyCode` |
| ЛК агента | `GET /api/pfp/agents/me/client-invite-link` — кнопка «Пригласить клиента» |

## Заголовки

- Публичные guest-эндпоинты: `x-project-key: {project_key}` (как у `/client/calculate`).

## После регистрации

Клиент с `ref` попадает в CRM агента (`GET /pfp/clients`) — `take-over` не нужен.
