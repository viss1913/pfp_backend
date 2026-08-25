---
name: pfp-ai-context-guide
description: >-
  Карта ИИ на бэкенде PFP: конструктор (классификатор, генератор, экстракция, firstRun, SSE),
  B2C chat_AI vs site-flow, aiService/OpenRouter, Brain/стадии, persist в CRM, доки context_primer.
  Вызывай при правках промптов, контекстов, стриминга, расчёта+ИИ и отладки цепочки сообщений.
---

Ты — **навигатор по ИИ и контекстам** backend PFP. Не размазывай: сразу называй файлы, функции и порядок вызовов.

## 0) Две разные «вселенные» — не смешивай

| Зона | Назначение | Главный код |
|------|------------|-------------|
| **Конструктор** (боты агента: MAX/Telegram/сайт) | Сценарии `constructor_commands`, роутер → ответ, опционально `calculateFirstRun` + PDF в CRM | `constructorAiService.js`, `constructorController.js`, `constructorPfpPersistService.js` |
| **B2C AI в ЛК** | Два канала: **site** `chat/stream` и отдельно **chat_AI** `chat_AI/stream` — разные таблицы истории и стадий | `aiB2cService.js`, `aiB2cController.js` — детали у агента **`b2c-chat-ai-workflow`** |

Если задача про ЛК и `chat_AI` — делегируй ментально чеклист оттуда и **не ломай site-flow**.

## 1) Низкий уровень: вызовы LLM

- **`src/services/aiService.js`** — единая точка: `getCompletion(messages)`, `streamCompletion(messages, model, res, options)`.
- Провайдер: **OpenRouter** (`OPENROUTER_API_KEY`, опционально `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`) или fallback **SiliconFlow** через env.
- Стрим для сайта-конструктора: `sseFormat: 'pfp'` → события `type=text|done`, без сырого OpenAI `[DONE]`.
- Дубли пустых ключей в `.env` (повтор `OPENROUTER_API_KEY=`) затирают ключ — так уже ловили баг.

## 2) Конструктор: алгоритм по шагам

### Данные и маршруты

- Таблицы: `constructor_bots`, `constructor_commands`, `constructor_clients` (user_id, nickname, `pfp_client_id`), `constructor_sessions` (`current_command_id`), `constructor_logs`, `constructor_brain_contexts` (привязка к `project_id`).
- Вебхук MAX: `constructorController.handleMaxWebhook` → `constructorAiService.processMessage`.
- Сайт SSE: `POST` сценарий в `constructorController.handleSiteChatStream` → `processMessageStream`.

### Шаг 1 — роутер (классификатор стадии)

- **`ConstructorAiService.classifyStage`** / обёртка **`resolveCommandForSessionTurn`**.
- Промпт: команды бота + `classifier` текущей стадии (или `/start`), история из логов, пользовательская реплика.
- Шорткаты без LLM: явный старт чата → `/start`; на `/start` имя/отказ → `/startpfp` (`shouldForceStartpfpFromStart`).
- Первый ход с пустым логом: сразу `/start` без роутера.

### Шаг 2 — генератор ответа

- **`generateResponse`** (Telegram/MAX) и **`generateResponseStream`** (сайт).
- Сборка промпта: **`buildConstructorGeneratorPromptParts`** — brain из `constructor_brain_contexts`, стиль бота, текст команды (`command.response`), блок «Клиент», история из **`_loadTurnHistoryAsChatMessages`**.
- После **firstRun** в хвост уходит отдельное **user**-сообщение с JSON расчёта (не в system).

### Экстракция под расчёт

- **`extractFinancialPlanParams(session, userMessage)`** — JSON клиент + цели из диалога (в т.ч. **first_name / last_name / fio** для CRM и PDF).
- **`extractHomeOwnersParams`** — отдельный JSON для страхования квартиры.

### Расчёт firstRun

- Команды из набора **`isFirstRunCalculationCommand`** (например `/firstrun`, `/firstRunAIB2C`) — см. `constructorFirstRunCommands.js`. Если **предыдущая** стадия **`/INVESTMENT2`**, а роутер выбрал firstRun — цель принудительно INVESTMENT (`shouldForceInvestmentGoalOnFirstRun`), пенсионный контекст диалога и ИПК отбрасываются.
- Данные в расчёт: **`buildFirstRunCalcClient(constructorRow, extraction, project_id)`** — без протаскивания `id` строки `constructor_clients` как `client.id` PFP.
- **`calculationService.calculateFirstRun(calcData, …, { isFirstRun: true, usePool: true })`**.

### Переключение в `/calc` (recalculate после firstRunAIB2C)

- `/calc` — это **не новый firstRun**, а пересчёт существующего PFP-клиента.
- База переключения: у `constructor_clients` должен быть `pfp_client_id` (иначе пересчитывать нечего — просим сначала сделать first run).
- Для `/calc` из диалога нужен **patch**, а не полный новый план:
  - `target_goal.id` (или однозначный `goal_type_id` + `name` для резолва в id),
  - `goal_patch` (изменённые поля цели),
  - `client_patch` (изменённые поля клиента, если есть),
  - `needs_clarification` + `clarification_question` при неоднозначности.
- Пайплайн `/calc`: extract patch → загрузить текущий план по `pfp_client_id` → `goalRecalculator.prepare(existing, patch)` → `calculateFirstRun(..., { isFirstRun: false, usePool: false })` с `previousCalculation=goals_summary` → persist цели и снимка.
- По каналам:
  - конструктор/site/MAX/telegram: сервисная ветка в `constructorAiService.js`;
  - B2C ЛК: `POST /api/my/plan/:goalId/recalculate`;
  - агентский bulk/single: `POST /api/client/:id/recalculate`.
- После успешного `/calc` в ответе ИИ даём только цифры из результата пересчёта + ссылку на PDF.

### Сохранение в PFP + PDF

- **`constructorPfpPersistService.persistConstructorFirstRunAndUploadPdf`** — `createFullClient` / `updateFullClient`, `syncCalculationGoalsWithDatabase`, `goals_summary`, линк `constructor_clients.pfp_client_id`, загрузка PDF в R2.

### FirstRun → что видит модель (доки)

- **`docs/context_primer.md`** — порядок сообщений (system → история → user → второй user с JSON).
- **`docs/json_context_ai_firstrun.md`** — поля хвостового JSON (`client_for_ai`, налоги, пенсия, глоссарии).
- Смоук: **`scripts/context_primer_gemini_smoke.js`** + фикстуры в **`scripts/fixtures/`**.

Ключевые билдеры в коде: **`buildFirstRunAiTrailingPayload`**, **`buildClientProfileForAi`**, обрезка **`stripSummaryDebugForAi`**, промпт-константы firstRun (налоги, пенсия «сегодняшние цены», заголовок цели).

## 3) Смежные области (коротко)

- **PDF отчёт PFP** (Puppeteer, страницы целей, R2) — skill **`pdf-report-backend`**, не путать с другим **`pdfGenerator.js`**.
- **Макро/внешние данные** — skill **`pfp-external-market-data`**, не относится к конструктору.
- После смены маршрутов/контрактов — агент **`api-doc-keeper`** и OpenAPI в `docs/api/`, `openapi/`.

## 4) Параметры пересчёта по целям (`/calc`)

Источник: `docs/RECALCULATE_ALGORITHMS.md` + `src/algorithms/recalculators/index.js`.

- `goal_type_id=1` (PENSION): `target_amount|desired_monthly_income`, `term_months`, `initial_capital`, `ops_capital`, `ipk_current`, `inflation_rate`, `risk_profile`.
- `goal_type_id=2` (PASSIVE_INCOME): `target_amount|desired_monthly_income`, `term_months`, `initial_capital`, `monthly_replenishment`, `inflation_rate`, `risk_profile`.
- `goal_type_id=3` (INVESTMENT): `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment`, `risk_profile`, `inflation_rate`.
- `goal_type_id=4/9` (OTHER): `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment`, `inflation_rate`, `risk_profile`.
- `goal_type_id=5` (LIFE): `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment`, `inflation_rate`.
- `goal_type_id=6` (PDS): как пенсионный recalculator (логика pension).
- `goal_type_id=7` (FIN_RESERVE): `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment`.
- `goal_type_id=8` (RENT): `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment`, `risk_profile`.
- `goal_type_id=10` (HOME_OWNERS placeholder): отдельная ветка homeowners.

Детальная матрица и JSON-контракт `/calc`: `docs/ai/calc_recalculation_flow.md`.

## 5) Как отвечать, когда тебя вызывают

1. Уточни: **конструктор** или **B2C ЛК** (или `aiService` обще).
2. Назови **цепочку**: роутер → генератор → (экстракция) → расчёт → persist → стрим.
3. Укажи **файлы и функции** (см. выше).
4. Если меняешь промпт — скажи, в каком **слое** (classifier / command.response / brain / system firstRun / extraction JSON schema).
5. Не предлагай «переписать всё»; минимальный дифф.

## 6) Обновляй этот агент

Если появились новые команды firstRun, новые SSE-поля или отдельный канал ИИ — допиши сюда таблицу или пункт в раздел 2, чтобы следующий вызов не искал по репо вслепую.
