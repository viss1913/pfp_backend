# B2C-оркестратор `/plan` — контракт для фронта

## Endpoint

```
POST /api/my/ai-b2c/chat/dynamic/stream
Authorization: Bearer <guest_token | client_jwt>
Content-Type: application/json
```

## Request body

Минимум: `flow_key` + (`message` **или** `event`).

Схема: [`aiB2c.yaml`](./aiB2c.yaml) → `AiB2cOrchestratorTurn`.

### Примеры

**Чат:**

```json
{
  "flow_key": "plan",
  "message": "хочу пенсию 200 000"
}
```

**Выбор цели на витрине:**

```json
{
  "flow_key": "plan",
  "event": "goal_selected",
  "goal_type_id": 1,
  "goal_name": "Достойная пенсия",
  "page": "/vybor_celi2"
}
```

**Отправка формы страницы:**

```json
{
  "flow_key": "plan",
  "event": "page_submit",
  "page": "/test23_pensia",
  "page_data": {
    "monthly_contribution": 15000,
    "target_amount": 200000
  }
}
```

## SSE (формат PFP)

Парсить строки `data: {...}\n\n`.

| Порядок | type | Действие фронта |
|---------|------|-----------------|
| 1 | `classifier_command` | Переключить экран по `command` / `stage_key` |
| 2..n | `text` | Дописать `text` в виджет чата |
| конец | `done` | Закрыть стрим |

### classifier_command

```json
{
  "type": "classifier_command",
  "command": "/test23_pensia",
  "stage_key": "/test23_pensia",
  "classifierSkipped": false
}
```

- `classifierSkipped: true` — первое сообщение в истории flow (старт без роутера, обычно `/start`).
- `command` и `stage_key` могут совпадать; ориентируйся на `stage_key` для роутера.

### text

```json
{ "type": "text", "text": "Отлично, давайте..." }
```

### done

```json
{ "type": "done" }
```

## Маппинг command → страница

Стадии настраивает агент в ЛК: `stage_key` = команда = route страницы (`/vybor_celi2`, `/test23_pensia`).

Список для клиента:

```
GET /api/my/ai-b2c/stages?flow_key=plan
```

## Настройка flow в ЛК агента

```
GET  /api/pfp/ai-b2c/flows
POST /api/pfp/ai-b2c/flows  { "flow_key": "plan", "title": "...", "clone_from": "default" }
GET  /api/pfp/ai-b2c/stages?flow_key=plan
PUT  /api/pfp/ai-b2c/settings?flow_key=plan
```

## Отличия от других чатов

| Endpoint | Когда |
|----------|--------|
| `POST /my/ai-b2c/chat/dynamic/stream` | **/plan**, оркестратор + команда на фронт |
| `POST /my/ai-b2c/chat/stream` | Фиксированный `stage` с фронта |
| `POST /my/ai-b2c/chat_AI/stream` | Отдельный виджет chat_AI, без `classifier_command` на фронт |
| `POST /pfp/constructor/site-chat/stream` | Лендинг-конструктор, другая БД |

## Пример обработки на фронте (псевдокод)

```javascript
const res = await fetch('/api/my/ai-b2c/chat/dynamic/stream', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ flow_key: 'plan', message: userText }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';
  for (const block of lines) {
    const raw = block.replace(/^data:\s*/, '').trim();
    if (!raw) continue;
    const evt = JSON.parse(raw);
    if (evt.type === 'classifier_command' && evt.command) {
      navigateByCommand(evt.stage_key || evt.command);
    } else if (evt.type === 'text') {
      appendChatChunk(evt.text);
    } else if (evt.type === 'done') {
      finishChatStream();
    }
  }
}
```
