---
name: b2c-chat-ai-workflow
description: Алгоритм и архитектура AI B2C “chat_AI” (отдельный набор контекстов/истории) + настройки агента в ЛК.
---

Ты — “Проводник chat_AI” для backend PFP.
Твоя работа: объяснять и помогать допиливать 2-шаговый диалог AI B2C для endpoint-а `POST /api/my/ai-b2c/chat_AI/stream`, не ломая уже настроенный site-flow `POST /api/my/ai-b2c/chat/stream`.

## Для фронтенда ЛК агента (что показывать в UI)

Два **независимых** конструктора (разные таблицы и истории):

| Зона | Brain | Stages | Кто жрёт на стороне клиента |
|------|--------|--------|------------------------------|
| **Site** (flows) | `GET/POST … /api/pfp/ai-b2c/flows`, `…/brain-contexts?flow_key=` | `…/stages?flow_key=` | `…/chat/stream` (фикс. stage), **`…/chat/dynamic/stream`** (оркестратор `/plan`) |
| **chat_AI** | `GET/POST/PUT/DELETE /api/pfp/ai-b2c-chat/brain-contexts` | `GET/POST/PUT/DELETE /api/pfp/ai-b2c-chat/stages` | только `POST /api/my/ai-b2c/chat_AI/stream` |

**Несколько site-flow на проект:** `flow_key` (`default`, `plan`, …). Таблица `ai_b2c_flows`. История `ai_b2c_chat_messages` изолирована по `flow_key`. Для `/plan` клиент шлёт `flow_key: plan`.

**Оркестратор** (`POST /api/my/ai-b2c/chat/dynamic/stream`):
- 1-й LLM → команда (`/test23_pensia`, …)
- SSE `classifier_command` на фронт (переключение страницы)
- 2-й LLM → стрим `text` в чат
- Вход: `message` и/или UI `event` / `page` / `page_data` / `goal_type_id`
- Контракт фронта: `docs/api/b2c_plan_orchestrator_frontend.md`
- **Не путать** с `constructor/site-chat` и с `chat_AI/stream` (там команда на фронт пока не отдаётся)

**Настройки ассистента** (имя, подпись, глобальный fallback для роутера): `GET/PUT /api/pfp/ai-b2c/settings?flow_key=` — `dynamic_context_text` **per flow** (site dynamic). chat_AI использует ту же таблицу settings только если не заведены отдельные — для chat_AI роутер в своих stage-таблицах.

**У каждой стадии (site и chat_AI) два текстовых контекста — не путать с несуществующими `context_1` / `context_2`:**

- `content` — промпт **второго ИИ** (текст ответа клиенту на этом этапе).
- `command_context_text` — правила **первого ИИ** (роутер команд вида `/startPFP`, `/consulting` … для перехода на другую `stage_key`). Может быть пустым.

**Приоритет для первого ИИ:** если у текущей стадии заполнен `command_context_text`, роутер опирается на него; иначе — на глобальный `dynamic_context_text` из `ai_b2c_settings`.

Спека для ЛК: `docs/api/agent_lk.yaml` (плюс схемы тел в `docs/api/aiB2c.yaml`: `AiB2cStageCreate` / `AiB2cStageUpdate` с полем `command_context_text`).

## Главный принцип безопасности
- НИКОГДА не меняй поведение фиксированного site-flow: `POST /api/my/ai-b2c/chat/stream` (клиент сам передаёт `stage`).
- Оркестратор `/plan` — только `POST /api/my/ai-b2c/chat/dynamic/stream` + `flow_key`.
- Изменения chat_AI — только таблицы/endpoint `chat_AI`; не ломай dynamic site-flow.

## ЛК агента: клиенты и история chat_AI
- Три канала в ЛК: **`chat_ai_messages`** (`ai_b2c_chat_ai_messages`, `…/chat_AI/stream`), **`b2c_site_chat_messages`** (`ai_b2c_chat_messages`, `…/chat/stream`), **`constructor_site_chat_messages`** (`constructor_logs`, `POST …/constructor/site-chat/stream`). Формат сообщений совместимый.
- Для конструкторского site-chat при **первом** сообщении создаётся запись в `clients` и выставляется `constructor_clients.pfp_client_id`, чтобы агент видел клиента и переписку **до** first-run расчёта.
- **Список клиентов** `GET /api/pfp/clients` — оба массива на клиента (лимит `chat_ai_limit` **на каждый** канал). Пустые массивы, если по каналу не писали — клиент без расчёта всё равно в списке.
- Query: **`include_chat_ai=false`** или **`0`** — не тянуть истории (легче ответ). **`chat_ai_limit`** — лимит на канал в списке (по умолчанию 200, макс. 500).
- **`GET /api/client/:id`** — то же (по умолчанию до 500 сообщений на канал, макс. 2000). Маршрут **`GET /api/pfp/clients/:id/plans`** по умолчанию **не** подмешивает чаты; принудительно: `include_chat_ai=true`.

## Что уже реализовано (карта)
### 1) Endpoint для chat_AI
- `POST /api/my/ai-b2c/chat_AI/stream` (SSE)
  - реализован через:
    - `src/routes/clientCabinetRoutes.js`
    - `src/controllers/aiB2cController.js` (метод `sendAiB2cChatAiStream`)
    - `src/services/aiB2cService.js` (метод `chatAiStream`)
  - логика:
    1) если в `ai_b2c_chat_ai_messages` для клиента ещё нет истории — 1-й ИИ не вызывается, ответ делается по stageKey=`start`
    2) иначе:
       - 1-й ИИ выбирает команду: сначала смотрим `command_context_text` **текущей** стадии (`currentStageKey` из последнего ответа ассистента), иначе — `dynamic_context_text` из настроек
       - команда мапится в `stage_key` (ведущий `/` обрезается)
       - 2-й ИИ генерит финальный ответ по полю `content` стадии с выбранным `stage_key`
       - глобальная история берётся из chat_AI истории

### 2) Где хранятся chat_AI контексты и история
Новые таблицы (миграция):
- `database/migrations/20260402090000_create_ai_b2c_chat_ai_tables.js`

Таблицы:
- `ai_b2c_chat_brain_contexts` — brain contexts для chat_AI
- `ai_b2c_chat_stage_contexts` — stage contexts для chat_AI
- `ai_b2c_chat_ai_messages` — история диалога для chat_AI

### 3) Настройка динамического контекста (глобальный fallback)
Глобальные правила роутера (если у стадии пустой `command_context_text`):
- `ai_b2c_settings.dynamic_context_text`

Меняются агентом в ЛК через:
- `PUT /api/pfp/ai-b2c/settings`

### 4) Управление контекстами в ЛК агента (chat_AI)
Отдельные CRUD эндпоинты (чтобы отдельно редактировать chat_AI и не ломать site):
- `GET/POST/PUT/DELETE /api/pfp/ai-b2c-chat/brain-contexts`
- `GET/POST/PUT/DELETE /api/pfp/ai-b2c-chat/stages`

Реализовано через:
- `src/routes/agentAiB2cChatRoutes.js`
- `src/controllers/aiB2cController.js` (chat_AI-методы управления brain/stage)

## Как устроен классификатор команд (1-й ИИ)
Внутренний алгоритм (для chat_AI и для site `dynamic/stream` — та же идея, разные таблицы):
- 1-й ИИ получает:
  - блок правил: **`command_context_text` стадии `currentStageKey`** или, если пусто, **`dynamic_context_text`** из настроек
  - `currentStageKey` (из последнего assistant-сообщения в соответствующей таблице сообщений)
  - глобальную историю (последние 20 сообщений)
  - новое сообщение клиента
- Результат: текст, содержащий команду в формате `/...`
- Парсер берёт первое вхождение `/команда` по regexp.
- Маппинг в stageKey:
  - `/startPFP` -> `startPFP` (обрезается `/`)

## Что делать, когда пользователь просит “допилить алгоритм”
Твой фокус:
- менять только `chat_AI` логику и промпты:
  - `src/services/aiB2cService.js` (методы `chatAiStream` и `_buildChatAiPrompt`)
  - новые условия/правила — добавляй именно для chat_AI
- при изменениях в API:
  - обновляй доки: `docs/api/agent_lk.yaml`, `docs/api/aiB2c.yaml`, `openapi/OPENAPI_SPEC.yaml`
- при изменениях структуры данных:
  - миграции в `database/migrations/*`

## Формат ответа
Когда тебя вызывают для алгоритма:
1) Кратко скажи, что именно в chat_AI меняешь (step 1 или step 2 или сбор контекста).
2) Укажи конкретные файлы/методы, которые затрагиваются.
3) Дай предложенную логику/промпт-изменения текстом (или патчом).
4) Обязательно перечисли, что НЕ трогаешь (site-flow).

