# PR: Агентская сеть + Resend + OpenAPI

Использовать как тело PR (`gh pr create --body-file docs/PR_AGENT_NETWORK_RESEND.md`).

## Summary

- **Partner ID и субагентская сеть**: `partner_agent_id`, `parent_agent_id`, referral slug, attribution; настройки в `projects.settings` (seed для Finam project **14**).
- **UTM в ссылках Финам**: трекинг в PDF-отчёте и broker email (`trackedPartnerUrl`).
- **Комиссии (scaffold)**: `commission_events`, `commission_accruals`, admin API `/api/admin/commission/*`.
- **Регистрация агента в 2 шага через Resend** (код на `noreply@…`).
- **Документация**: [`docs/api/agent_lk.yaml`](docs/api/agent_lk.yaml), `openapi/OPENAPI_SPEC.yaml`, `openapi/admin-management.yaml`.

## Breaking change (фронт)

Регистрация агента **больше не one-shot**:

| Шаг | Endpoint | Body |
|-----|----------|------|
| 1 | `POST /auth/register-agent` | `email`, `project_key`, `first_name`, `last_name`, опционально `partner_agent_id` / `partner_ref_url` / `ref` / `utm_*` — **без `password`** |
| 2 | `POST /auth/verify-agent-registration` | `{ email, code, password }` → JWT |

Старый UI, который шлёт `password` на первый шаг, **сломается** до переключения на 2-step flow.

Дополнительно: `POST /auth/parse-partner-agent`, `GET /pfp/agents/me/subagents`, `GET /pfp/agents/me/invite-link`.

Контракт ЛК: **agent_lk.yaml** (тег «Регистрация и профиль агента»).

## Миграции (обязательно на deploy)

```bash
npx knex migrate:latest
```

- `20260516120000_agent_partner_network_and_commission.js`
- `20260516130000_email_verifications_purpose_payload.js`

## Env после merge

| Переменная | Назначение |
|------------|------------|
| `RESEND_API_KEY` | API Resend |
| `RESEND_FROM_EMAIL` | Verified sender; при шаблоне `{agent}@domain` коды с `noreply@domain` |
| `AGENT_REGISTER_BASE_URL` / `FRONTEND_AGENT_REGISTER_URL` | invite-link (опционально) |

Smoke (опционально): `NODE_ENV=production npm run smoke:resend -- your@email.com`

## Риски

| Риск | Митигация |
|------|-----------|
| Фронт не обновлён | Breaking в PR; два endpoint'а |
| Миграции не прогнали | migrate в runbook |
| Resend 403 | verified domain + `RESEND_FROM_EMAIL` |
| Дубликат `partner_agent_id` | 409 на register step 1 |

Перед `require_on_registration` на Finam — **backfill** `partner_agent_id` у существующих агентов.

## Test plan

- [x] Локально: `npx knex migrate:latest` (batch с 2 миграциями)
- [x] `node --test tests/unit/trackedPartnerUrl.test.js` (4/4)
- [ ] test/prod: `knex migrate:latest`
- [ ] `POST /auth/register-agent` → письмо с кодом
- [ ] `POST /auth/verify-agent-registration` → JWT
- [ ] `GET /pfp/agents/me/invite-link` с env base URL
- [ ] Finam PDF / broker email — UTM в ссылках при включённом `partner_link_tracking`

## Suggested commit message

```
feat(agents): partner ID, subagent network, Resend registration, UTM in Finam links

- 2-step agent register via Resend; agent_lk + OpenAPI updated
- partner_agent_id, parent_agent_id, commission events scaffold
- Migrations required on deploy
```
