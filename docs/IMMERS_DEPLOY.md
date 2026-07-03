# Immers: деплой backend PFP (test)

Публичный API: **https://pfp-api.bank-future.com/api**  
VM: `81.94.159.209`, код: `/opt/pfp/app`, Docker `mysql` + `backend`.

Примечание на `2026-05`: живой IP сейчас резолвится через `pfp-api.bank-future.com` в `81.94.159.209`. Старый `195.209.218.118` больше не использовать как опорный адрес для SSH/диагностики.

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
| `PFP_PDF_FINAM_AI=0` | PDF/отчёты без OpenRouter (шаблоны Finam, пустое executive summary) |
| `REPORT_PDF_POST_LOAD_DELAY_MS=100` | Стартовый safe-tuning для Puppeteer на Immers; при smoke можно снижать до `50` или `0` |
| `FINAM_REPORT_V2_RENDER_CONCURRENCY=1` | Не поднимать выше `1` на `2 vCPU / 4 GB`, пока нет замеров CPU/RAM |
| `REPORT_PDF_GS_COMPRESS=1` | Включить post-compress через Ghostscript, если приоритет — маленький PDF |
| `REPORT_PDF_GS_PDFSETTINGS=/screen` | Самый агрессивный профиль на Immers для small-size PDF; мягче вариант — `/ebook` |
| `COMON_SYNC_PAGE_SIZE=100`, `COMON_SYNC_MAX_PAGES=3` | Daily sync recommended-каталога Comon в `comon_recommended_strategies` |
| `AGENT_REGISTER_BASE_URL=https://family-office.bank-future.com/register/` | Ссылка субагента (invite-link, письмо) |
| `AGENT_INVITE_ACTIVATE_BASE_URL=https://family-office.bank-future.com/invite/activate` | Magic-link после `POST .../family-office-invite` (без env после деплоя кода — тот же хост из `AGENT_REGISTER_BASE_URL`) |
| `TELEGRAM_PROXY_URL` | Опционально: HTTP/SOCKS-прокси **только** для Telegram Bot API (конструктор), если Immers блокирует `api.telegram.org`. Пример: `http://user:pass@45.77.80.63:3128`. Не путать с глобальным `HTTP_PROXY`. |

Полный список — `.env.example`. Секреты не коммитить.

### Telegram конструктора через VPS (если блок api.telegram.org)

1. На Vultr поднять HTTP-прокси (например 3proxy) с auth; firewall — порт только с `81.94.159.209`.
2. В `.env.production`: `TELEGRAM_PROXY_URL=http://user:pass@VPS_IP:3128`
3. Smoke в контейнере: `node scripts/smoke_telegram_proxy.mjs` → `OK ... HTTP 200/302`
4. `docker compose restart backend` — в логах: `[telegramProxy] Telegram Bot API uses TELEGRAM_PROXY_URL`

## DNS и HTTPS

1. A-запись `pfp-api.bank-future.com` → актуальный IP VM.
2. nginx → `127.0.0.1:3000`, certbot Let's Encrypt.
3. В compose для backend при проблемах Resend/ЦБ/MOEX: DNS `8.8.8.8`, `1.1.1.1`, `NODE_OPTIONS=--dns-result-order=ipv4first`, `dns_opt: ndots:0` (см. `tmp/docker-compose.immers.yml`).
4. Для ускорения HTML на test включить `gzip` в nginx как минимум для `text/html`, `application/json`, `text/css`, `application/javascript`, `image/svg+xml` (см. `tmp/pfp-api-nginx.conf`).

## Быстрые wins по latency

1. Для HTML-предпросмотра использовать `GET /api/pfp/reports/:clientId/html?format=html` или `GET /api/my/plan/report/html?format=html`, если не нужен JSON.
2. Если нужен JSON, `pages[]` запрашивать только при `includePages=1`; по умолчанию backend отдаёт только цельный `html`.
3. Для тяжёлого PDF из UI предпочитать `GET /api/pfp/reports/:clientId/pdf-url` / `GET /api/my/plan/report/pdf-url`, а не синхронный `GET /pdf`.
4. На Immers держать `PFP_PDF_FINAM_AI=0`.
5. Не включать `REPORT_PDF_GS_COMPRESS` в request-path, если цель — скорость ответа; компрессию имеет смысл оставлять только для фоновой генерации через `pdf-url`.

## Режим small-size PDF

Если приоритет не latency, а вес файла, на Immers можно включить:

```bash
REPORT_PDF_GS_COMPRESS=1
REPORT_PDF_GS_PDFSETTINGS=/screen
```

Практический ориентир по Finam v2 на test-контуре: PDF порядка `10 MB` сжимается примерно до `1.9-2.1 MB`, но добавляет около `4s` на post-compress.

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

Для **project_id=2** (Immers test Finam) расчёт LIFE — «Подушка безопасности · Сбер» (`SBER_LIFE_CALC_PROJECT_IDS`, по умолчанию `2,14,28,29`). Иначе в диаграммах и PDF fallback **НСЖ Династия**. После деплоя — **пересчёт** клиента.

Пустой `macro_data` → фронт **0** и **01.01.1970**. Синк на VM:

```bash
docker compose cp scripts/run_macro_sync.js backend:/app/scripts/
docker compose exec backend node scripts/run_macro_sync.js
```

Или `POST /api/pfp/macro/sync` (admin). Проверка: `SELECT COUNT(*) FROM macro_data;`

### 4. Приёмка в ЛК (ручная)

1. Пересчитать клиента с целью **PENSION** — в `goals_summary` есть цифры, без `Pension portfolio not found`.
2. Цель **LIFE** — в PDF v2 лист «Подушка безопасности · Сбер Страхование Жизни».
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

Миграция **`20260703130000_drop_pension_payout_coefficients.js`** — коэффициенты только в матрице `passive_income_yield` (поля `gender`, `age` в `lines`).

После выката — smoke:

```bash
curl -sS "https://pfp-api.bank-future.com/api/pfp/settings/passive-income/yield" \
  -H "Authorization: Bearer <token>" \
  -H "X-Project-Key: <project_key>"
```

Пока в строках нет gender/age — пенсия берёт универсальные линии (как на скрине админки). После заливки матрицы — пересчёт клиентов.

Скрипты `scripts/seed_default_portfolios_if_missing.js` и `scripts/run_macro_sync.js` — в образе после pull; для hotfix без rebuild — `docker compose cp` как выше.

### 4. Comon recommended (витрина в Finam Report v2)

После деплоя кода с `scripts/sync_comon_recommended_strategies.js` backend сам ходит именно в `GET /api/v2/strategies?tags=recommended` и пишет результат в нашу БД.

```bash
# смоук egress с VM (ожидаем 200 и JSON, не HTML Forbidden)
curl -sS -o /dev/null -w "%{http_code}\n" "https://www.comon.ru/api/v1/maintenance-info"
curl -sS "https://www.comon.ru/api/v2/strategies/?tags=recommended&page=1&pageSize=3" | head -c 400

docker compose exec backend node scripts/sync_comon_recommended_strategies.js
docker compose exec mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e \
  "SELECT COUNT(*) AS n FROM comon_recommended_strategies;" "$MYSQLDATABASE"
```

Cron (пример): `0 4 * * * cd /opt/pfp/app && docker compose exec -T backend node scripts/sync_comon_recommended_strategies.js >> /var/log/pfp-comon-sync.log 2>&1`

Если `paging.totalPages` у Comon внезапно больше `COMON_SYNC_MAX_PAGES`, sync завершится ошибкой и не будет перетирать таблицу частичным каталогом.

Лист Comon в PDF v2 появляется только если в `goals_summary` в своде есть **акции** (`product_type: STOCK`) и после фильтра витрины есть `comon_showcase.items[]`. Иначе в API может быть `skip_reason: no_stock_in_plan`.

Comon showcase в коде разрешён только для Finam test/prod (`project_id 2,14`; override через `COMON_SHOWCASE_PROJECT_IDS`).

При **403** с Comon — `COMON_PROXY_URL` (см. `.env.example`, агент `comon_finam`).

## Smoke

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://pfp-api.bank-future.com/api-docs/
curl -sS -X POST https://pfp-api.bank-future.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin>","password":"<secret>"}'
```

Фронт: `VITE_API_BASE_URL=https://pfp-api.bank-future.com/api`, для admin tenant — `X-Project-Key` тестового проекта.

Для HTML/PDF latency после выката:

```bash
free -h
docker stats --no-stream app-backend-1 app-mysql-1
time curl -sS -o /dev/null "https://pfp-api.bank-future.com/api/pfp/reports/<clientId>/html?format=html"
time curl -sS -o /dev/null "https://pfp-api.bank-future.com/api/pfp/reports/<clientId>/pdf-url"
```

## Известные проблемы

| Симптом | Fix |
|---------|-----|
| Пенсия не считается | 1) Нет default-портфеля PENSION → `seed_default_portfolios_if_missing.js`. 2) `Passive income yield line not found` → проверить `passive_income_yield` (срок до 360 мес., сумма, при НПФ-таблице — gender/age в строках или универсальные fallback-строки без gender/age). 3) Пересчёт клиента после смены матрицы. |
| Старый отчёт | `report_finam=1` или проект не в `FINAM_REPORT_PROJECT_IDS` |
| Макро 1970 | `macro_data` пуст → `run_macro_sync.js` |
| HTML/PDF медленные | 1) Проверить, что клиент уже со snapshot в `goals_summary`. 2) Снизить `REPORT_PDF_POST_LOAD_DELAY_MS` (`100 -> 50 -> 0`) со smoke. 3) Убедиться, что UI ходит в `?format=html` и `pdf-url`, а не в тяжёлый JSON/`/pdf`. |
| NDA 502 / 120s timeout | 1) DNS/Resend как выше. 2) По умолчанию `NDA_EMAIL_DELIVERY=attach-url` (вложение через R2 path, ~секунды). Не включать `attach` + inline base64 на Immers. 3) `docker cp` / `git pull && docker compose build backend`. |
| `birth_date` 19980 | `normalizeMysqlDate.js` на backend |
| Полный seed | **Не запускать** на живой БД — удалит users |

## Fallback для слабой VM

- Если swap отсутствует, добавить `2-4 GB` swap перед дальнейшим тюнингом PDF.
- Если длинный Finam v2 всё ещё упирается в CPU/RAM, поднять VM с `4 GB` до `8 GB`.
- Если важен размер PDF, а не latency, выносить тяжёлую компрессию в фоновый сценарий `pdf-url`, а не в синхронный `/pdf`.

## Тестовый проект Finam на Immers

| Поле | Значение |
|------|----------|
| `project_id` | 2 |
| `X-Project-Key` | `pk_7f1ccfe5b2598134a575320d` (проверить в `projects` на VM) |

Прод Finam — project **14**; настройки 2 и 14 не идентичны (Comon, agent_network — сверять `projects.settings`).
