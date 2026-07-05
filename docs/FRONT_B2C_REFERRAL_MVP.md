# Family Office B2C — фронт (чеклист MVP)

Бэкенд-контракт: [`docs/api/b2c_lk.yaml`](api/b2c_lk.yaml), [`docs/api/agent_lk.yaml`](api/agent_lk.yaml).

## Поток (рекомендуемый)

```
/?ref=XXX&project_key=pk
  → sessionStorage: ref, utm, project_key
  → GET /auth/client-referral/preview
  → /plan (guest CJM)
  → GET /client/risk-profile/questionnaire-v2
  → POST /client/risk-profile/evaluate (опционально)
  → POST /client/calculate  ← один вызов: расчёт + сохранение + guest_token
  → отчёты по guest_token
  → (опционально) register-client → verify-code — заклеймить аккаунт
```

## Авто-сохранение без регистрации

**`POST /api/client/calculate`** — если в теле есть `client.email` (+ `ref` из sessionStorage):

- создаёт/обновляет лид в `clients` (без `users`)
- `agent_id` по `ref`
- в ответе: `client_id`, `guest_token`, `plan_saved: true`
- повторный расчёт с тем же email **обновляет** профиль (телефон, активы…)

Отдельный `plan/save` — опциональный дубль того же поведения.

## Активы и капитал (частая ошибка фронта)

Бэкенд ждёт **одно из**:

| Поле | Где | Зачем |
|------|-----|--------|
| `client.total_liquid_capital` | `client` | Ликвидный «бассейн» (₽) |
| `client.assets` | `client` | Массив активов |
| `assets` | **корень JSON** | То же (альтернатива, бэкенд мержит в `client.assets`) |

Пример актива:

```json
{
  "type": "CASH",
  "current_value": 500000,
  "unlock_month": 0
}
```

Если **ни assets, ни total_liquid_capital** — пул = 0, в логах бэка warning:
`calculateFirstRun: no client.assets/total_liquid_capital in request`.

**Ошибка на фронте**, если CJM собирает активы, но не кладёт их в payload `calculate`.

## Отчёты

```http
Authorization: Bearer {guest_token}
GET /api/my/plan/report/html
GET /api/my/plan/report/pdf
GET /api/my/plan/report/pdf-url
```

## Регистрация позже

`register-client` → `verify-code` — линкует существующего лида по email, добавляет пароль. `agent_id` и план не теряются.

## CRM агента

Лид: `registration_status: lead`. После verify: `registered`.
