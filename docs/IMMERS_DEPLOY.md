# Immers: деплой backend PFP (test)

Публичный API: **https://pfp-api.bank-future.com/api**  
VM: `bankfuturebackend`, публичный IP **`81.94.159.209`** (westcall; ранее `195.209.218.118`), код: `/opt/pfp/app`, Docker `mysql` + `backend` (+ `qdrant` для RAG).

Подробный runbook агента: [`.cursor/agents/immers-deploy.md`](../.cursor/agents/immers-deploy.md).

## Обязательные переменные (`.env.production` на VM)

| Переменная | Назначение |
|------------|------------|
| `MYSQLHOST=mysql` | Имя сервиса compose, не Railway |
| `JWT_SECRET` | Обязателен |
| `PFP_PUBLIC_API_BASE_URL=https://pfp-api.bank-future.com/api` | Ссылки на PDF из писем/ботов |
| `AUTO_SEED` | `true` только при **первом** старте test; дальше **`false`** |
| `FINAM_REPORT_PROJECT_IDS=2` | Finam-template для тестового проекта Finam (id=2) |
| `FINAM_REPORT_VERSION=2` | Глобально разрешить v2 |
| `FINAM_REPORT_VERSION_PROJECT_IDS=2` | Проекты, где v2 доступен по настройке |
| `MACRO_CRON_SECRET` | Cron `POST /api/pfp/macro/cron/inflation` |
| `MACRO_STARTUP_SYNC=1` | Опционально: первое наполнение `macro_data` после деплоя |

Полный список — `.env.example`. Секреты не коммитить.

## DNS и HTTPS

1. A-запись `pfp-api.bank-future.com` → IP VM.
2. nginx → `127.0.0.1:3000`, certbot Let's Encrypt.
3. В compose для backend при проблемах Resend/ЦБ/MOEX: DNS `8.8.8.8`, `1.1.1.1`, `NODE_OPTIONS=--dns-result-order=ipv4first`, `dns_opt: ndots:0` (см. `tmp/docker-compose.immers.yml`).

## После первого старта (чеклист, 2026-05)

Выполнить **один раз** на живой БД (без полного `knex seed:run` — он удалит users).

### 1. Finam Report v2 для project id=2

```bash
# В .env.production (если ещё нет):
FINAM_REPORT_PROJECT_IDS=2
FINAM_REPORT_VERSION=2
FINAM_REPORT_VERSION_PROJECT_IDS=2

docker compose restart backend
```

В БД (миграция `20260522140000_report_finam_v2_project_2_test.js` или SQL):

```sql
INSERT INTO system_settings (`key`, value, value_type, category, project_id)
SELECT 'report_finam', '2', 'number', 'report', 2
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE `key`='report_finam' AND project_id=2);
UPDATE system_settings SET value='2' WHERE `key`='report_finam' AND project_id=2;
```

Проверка после перегенерации PDF: в payload/HTML есть `reportSchemaVersion: "finam-v2.0"`.

### 2. Дефолтные портфели (пенсия и др.)

Частичный `AUTO_SEED` мог не создать портфели с `classes` → `Pension portfolio not found`.

```bash
docker compose exec backend mkdir -p /app/scripts
docker compose cp scripts/seed_default_portfolios_if_missing.js backend:/app/scripts/
docker compose exec backend node scripts/seed_default_portfolios_if_missing.js
```

Скрипт идемпотентен: только `is_default` портфели по `portfolio_classes`, ПДС из `products.is_default`.

### 3. Макростатистика

**Перенос с Railway:** справочник `macro_indicators` одинаковый (миграции). Данные — `macro_data`:

```bash
# экспорт с Railway (MYSQL_PUBLIC_URL из .env Railway)
node scripts/export_macro_data_json.js > macro_data.json

# на Immers (файл в /opt/pfp/app)
docker compose cp macro_data.json backend:/app/macro_data.json
docker compose exec backend node scripts/import_macro_data_dump.js macro_data.json
```

Или без файла: `docker compose exec backend node scripts/run_macro_sync.js` — подтянет ЦБ/MOEX/Rosstat с VPS (уже ~150+ строк после синка).

### 3b. LIFE — Сбер, не «НСЖ Династия»

Для **project_id=2** (Immers test Finam) расчёт LIFE — «Страхование по подписке · Сбер» (`SBER_LIFE_CALC_PROJECT_IDS`, по умолчанию `2,14,28,29`). Иначе в диаграммах и PDF fallback **НСЖ Династия**. После деплоя — **пересчёт** клиента.

Пустой `macro_data` → фронт **0** и **01.01.1970**. Синк на VM:

```bash
docker compose cp scripts/run_macro_sync.js backend:/app/scripts/
docker compose exec backend node scripts/run_macro_sync.js
```

Или `POST /api/pfp/macro/sync` (admin). Проверка: `SELECT COUNT(*) FROM macro_data;`

### 4. Приёмка в ЛК (ручная)

1. Пересчитать клиента с целью **PENSION** — в `goals_summary` есть цифры, без `Pension portfolio not found`.
2. Цель **LIFE** — в PDF v2 лист «Страхование по подписке · Сбер Страхование Жизни».
3. Сгенерировать PDF — оглавление v2, пенсия ~3 страницы.
4. Дашборд макро — даты не 1970, ключевая/ИПЦ/USD/EUR заполнены.
5. Продукты: системный «ПДС НПФ» (`includeDefaults=true`) + свой ПДС в портфеле пенсии — норма.

После смены `report_finam` — сброс кеша PDF клиента (в коде при смене настройки) и новая генерация.

## Обновление кода

```bash
cd /opt/pfp/app
git pull
docker compose build backend
docker compose up -d
docker compose exec backend npm run migrate
```

Скрипты `scripts/seed_default_portfolios_if_missing.js` и `scripts/run_macro_sync.js` — в образе после pull; для hotfix без rebuild — `docker compose cp` как выше.

## Smoke

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://pfp-api.bank-future.com/api-docs/
curl -sS -X POST https://pfp-api.bank-future.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin>","password":"<secret>"}'
```

Фронт: `VITE_API_BASE_URL=https://pfp-api.bank-future.com/api`, для admin tenant — `X-Project-Key` тестового проекта.

## Известные проблемы

| Симптом | Fix |
|---------|-----|
| Пенсия не считается | 1) Нет default-портфеля PENSION → `seed_default_portfolios_if_missing.js`. 2) В `goals_summary` ошибка `Passive income yield line not found` → в `system_settings` нужен `passive_income_yield` с `max_term_months` **360** (не 60), миграция `20260522150000_extend_passive_income_yield_for_pension.js`. После фикса — **пересчёт** клиента. |
| Старый отчёт | `report_finam=1` или проект не в `FINAM_REPORT_PROJECT_IDS` |
| Макро 1970 | `macro_data` пуст → `run_macro_sync.js` |
| NDA 502 Resend | `Unable to fetch… could not be resolved` — обновить compose (DNS + `NODE_OPTIONS=--dns-result-order=ipv4first`), задеплоить `emailService` с `sendViaResend` (5 retry). Smoke: `docker compose exec backend node scripts/smoke_resend.js you@mail.com` |
| `birth_date` 19980 | `normalizeMysqlDate.js` на backend |
| Полный seed | **Не запускать** на живой БД — удалит users |

## Тестовый проект Finam на Immers

| Поле | Значение |
|------|----------|
| `project_id` | 2 |
| `X-Project-Key` | `pk_7f1ccfe5b2598134a575320d` (проверить в `projects` на VM) |

Прод Finam — project **14**; настройки 2 и 14 не идентичны (Comon, agent_network — сверять `projects.settings`).
