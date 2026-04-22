# План: клиенты из чата-конструктора в ЛК + PDF Ростех

## Проблема

- В [`src/services/constructorAiService.js`](../../src/services/constructorAiService.js) после `calculateFirstRun` данные не попадают в таблицу **`clients`** — только сущность **`constructor_clients`** (чат).
- Список в ЛК агента строится из **`clients`** + фильтр по **`agent_id`**.
- PDF Ростеха идёт через [`reportPdfService`](../../src/services/reportPdfService.js) и [`reportService.getClientReportData`](../../src/services/reportService.js) по **`clientId`** и **`goals_summary`** в БД; в конструкторе для firstRun PDF не вызывается (в отличие от `/homeownerscalc`).

## Цель

1. После успешного расчёта firstRun в чате — **создать/обновить** запись **`clients`** (как смысл [`clientController.firstRun`](../../src/controllers/clientController.js)).
2. Агент **видит клиента** в списке и **открывает ПФП** (`GET /api/pfp/clients`, `GET /api/pfp/clients/:id`).
3. **Тот же алгоритм PDF**, что при обычном отчёте: `generateClientReportPdfPackage` + загрузка в R2 по образцу [`reportController.getClientReportPdfUrl`](../../src/controllers/reportController.js); ссылку отдать пользователю в чате (и при необходимости в SSE).

## Шаги реализации

### 1. Связь конструктор ↔ ПФП

- Миграция: в **`constructor_clients`** поле **`pfp_client_id`** (nullable, FK на `clients.id`).

### 2. Сервис сохранения

- Один метод, например **`persistConstructorCalculationToPfpClient`**: из `calculationResponse` + `extractFinancialPlanParams` + `constructor_clients` / бот собрать payload; **`clientService.createFullClient`** или update; **`_syncGoalsWithDatabase`** (вынести общий helper из [`clientController`](../../src/controllers/clientController.js)); **`updateClient({ goals_summary })`**; обновить **`pfp_client_id`**.

### 3. Точки вызова

- После успешного **`calculateFirstRun`** в **`processMessage`** и **`processMessageStream`** (обе ветки `isFirstRunCalculationCommand`).

### 4. PDF

- После persist: **`reportPdfService.generateClientReportPdfPackage`** с теми же параметрами, что в отчёте; **`uploadPublicFile`**; URL в ответ ассистента / Telegram / опционально тип в SSE.

### 5. Видимость в списке агента

- **Вариант A:** при сохранении проставлять **`agent_id`** = агент владельца бота (или дефолт проекта).
- **Вариант B:** расширить **`getClientsByAgent`** query (например лиды проекта без агента).

### 6. Проверки

- Сценарий чата → клиент в списке → карточка ПФП → PDF открывается.
- При необходимости — OpenAPI; верстку Ростеха не дублировать (см. `.cursor/rules/rostech-pdf-report.mdc`).

## Риски

- Дубли клиентов — лечится `pfp_client_id` + upsert по email/телефону.
- Неполный extraction — минимальный набор полей для CRM.
- PDF падает — клиент в БД уже сохранён, ошибку логировать.

---

## Для другого разработчика: контекст и куда смотреть

### Зачем это вообще

Сейчас два параллельных мира:

| Мир | Таблицы / суть | Где в коде |
|-----|----------------|------------|
| **Чат-конструктор** (бот / виджет) | `constructor_clients`, `constructor_sessions`, `constructor_logs` | [`src/services/constructorAiService.js`](../../src/services/constructorAiService.js), [`src/services/constructorBotService.js`](../../src/services/constructorBotService.js) |
| **ПФП + ЛК агента** | `clients`, `goals`, `goals_summary` | [`src/services/clientService.js`](../../src/services/clientService.js), [`src/controllers/clientController.js`](../../src/controllers/clientController.js), [`src/repositories/clientRepository.js`](../../src/repositories/clientRepository.js) |

Расчёт firstRun в конструкторе **уже вызывается** (`calculationService.calculateFirstRun`), но результат **нигде не сохраняется** в `clients` — поэтому в CRM пусто и PDF-отчёт собрать не из чего.

Задача: **после успешного расчёта** прогнать тот же смысл, что `firstRun` в `clientController`, и потом вызвать **тот же** PDF-пайплайн, что для обычного отчёта.

### Ключевые файлы (читать в таком порядке)

1. **Где считается firstRun в чате**  
   [`src/services/constructorAiService.js`](../../src/services/constructorAiService.js)  
   - Поиск: `isFirstRunCalculationCommand`, `calculateFirstRun`, `processMessage`, `processMessageStream` (две ветки — править **обе**).  
   - Сейчас после расчёта в JSON уходит только во **второй** LLM (`generateResponse` / `generateResponseStream`). Сюда же встраивается persist + PDF.

2. **Эталон «сохранить клиента + цели + снапшот»**  
   [`src/controllers/clientController.js`](../../src/controllers/clientController.js) — метод `firstRun`:  
   `createFullClient` → `_syncGoalsWithDatabase` → `updateClient({ goals_summary })`.  
   Либо аналог в ЛК клиента: [`src/controllers/clientCabinetController.js`](../../src/controllers/clientCabinetController.js) — `createMyPlan` (там update существующего `clientId`).

3. **Список клиентов агента**  
   [`src/controllers/clientController.js`](../../src/controllers/clientController.js) — `listByAgent`  
   [`src/services/clientService.js`](../../src/services/clientService.js) — `getClientsByAgent` → `findAllByAgent` / `findAllByProject`  
   [`src/repositories/clientRepository.js`](../../src/repositories/clientRepository.js) — `findAllByAgent` фильтрует `agent_id`. Если новые клиенты без агента — их **не видно**, пока не согласуете вариант A/B из плана выше.

4. **Отчёт и PDF (Ростех — это тема, не отдельный «другой» PDF)**  
   - Данные отчёта: [`src/services/reportService.js`](../../src/services/reportService.js) — `getClientReportData` (снапшот из `goals_summary`, иначе пересчёт).  
   - Сборка PDF: [`src/services/reportPdfService.js`](../../src/services/reportPdfService.js) — `generateClientReportPdfPackage` / `generateClientReportPdf`.  
   - Тема `rostech`: [`src/reports/themes/themeResolver.js`](../../src/reports/themes/themeResolver.js) + папка `src/reports/themes/rostech/`.  
   - Загрузка URL (образец): [`src/controllers/reportController.js`](../../src/controllers/reportController.js) — `getClientReportPdfUrl` (`uploadPublicFile` из [`src/utils/r2Client.js`](../../src/utils/r2Client.js)).  
   - ЛК клиента (тот же PDF): [`src/controllers/clientCabinetController.js`](../../src/controllers/clientCabinetController.js) — `getMyReportPdf` / пакет с R2.

5. **Правила правок верстки Ростех-PDF (не ломать цифры)**  
   [`.cursor/rules/rostech-pdf-report.mdc`](../../.cursor/rules/rostech-pdf-report.mdc)  
   Скилл по отчёту: [`.cursor/skills/pdf-report-backend/SKILL.md`](../../.cursor/skills/pdf-report-backend/SKILL.md)

6. **Роуты агента к клиентам**  
   [`src/routes/agentClientRoutes.js`](../../src/routes/agentClientRoutes.js) — `GET /api/pfp/clients`, `GET /api/pfp/clients/:id`

### Поток данных (целевой)

```
Пользователь в чате → constructorAiService (firstRun-команда)
  → calculateFirstRun → calculationResponse
  → НОВОЕ: persist в clients + goals + goals_summary
  → НОВОЕ: generateClientReportPdfPackage + uploadPublicFile → pdf_url
  → ответ пользователю (текст + ссылка; в Telegram — см. constructorBotService)
```

### Порядок работ (практический)

1. Миграция `constructor_clients.pfp_client_id` (и при необходимости индекс).  
2. Вынести/повторить логику `_syncGoalsWithDatabase` без дублирования простыни (общий модуль или метод сервиса).  
3. Реализовать `persistConstructorCalculationToPfpClient` (одна точка входа).  
4. Вызвать её из **обоих** мест firstRun в `constructorAiService`.  
5. После persist — вызов PDF + R2; прокинуть URL в UX чата (и SSE, если сайт).  
6. Согласовать с продуктом **agent_id** (вариант A или B) и при необходимости поправить выборку списка.  
7. Прогнать: чат → клиент в `GET /api/pfp/clients` → открытие карточки → PDF по URL или `GET .../reports/:clientId/pdf-url`.

### На что не натыкаться

- **Не** путать PDF конструктора для страховки квартиры (`/homeownerscalc`, `pdfGenerator`) с ПФП-отчётом Ростех — для задачи нужен **`reportPdfService`**.  
- После persist в БД **`goals`** должны совпасть с расчётом (sync id), иначе отчёт/дашборд могут разъехаться с снапшотом.  
- Стриминг ответа второго LLM уже идёт; URL PDF лучше добавлять **после** генерации файла (не обещать ссылку в промпте до факта).  
- Логи роутера конструктора: префикс `[ConstructorAI Step1]` в `constructorAiService.js` — для отладки стадий.

### Тестирование

- API агента с JWT + `tenantMiddleware`: список и карточка клиента.  
- При наличии скрипта: `scripts/test_report_client.js <clientId>` для проверки PDF после появления клиента в БД (см. правила rostech-pdf-report).
