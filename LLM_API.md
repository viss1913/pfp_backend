# Чистый LLM API (Immers / коллеги)

Простой HTTP-доступ к языковой модели на сервере аудитора **без** оркестратора, skills и парсинга.

## Что стоит на Immers

| Параметр | Значение (прод, на момент проверки) |
|----------|--------------------------------------|
| Runtime | **Ollama** `http://127.0.0.1:11434` (OpenAI-совместимый `/v1`) |
| Через auditor | `LLM_BASE_URL=http://127.0.0.1:11434/v1` |
| `LLM_PROVIDER` | `openai` (означает OpenAI-compatible, не OpenAI.com) |
| Текст по умолчанию | `LLM_MODEL=gemma3:27b` (в `.env`; можно переопределить в запросе) |
| Qwen | `QWEN_MODEL=qwen2.5:7b-instruct` |
| Vision | `qwen2.5vl:7b` |
| Также в Ollama | `qwen3.6:27b`, `qwen2.5:7b-instruct`, `qwen2.5vl:7b`, `gemma3:27b` |

Да, **Qwen есть** (и как text, и vision). Дефолт текста в `.env` сейчас **gemma3:27b** — для Qwen передайте `"model": "qwen2.5:7b-instruct"` или `"qwen3.6:27b"`.

Ollama слушает **только localhost** Immers. Снаружи коллегам нужен **прокси аудитора** (ниже), а не прямой `:11434`.

---

## Auth

### A) Service key (для тестов / коллег / скриптов) — удобно

На сервере в `.env`:

```env
LLM_API_KEY=<длинный секрет>
# или MARLON_LLM_SERVICE_KEY=...
```

В запросе **один** из вариантов:

```http
Authorization: Bearer <LLM_API_KEY>
X-Api-Key: <LLM_API_KEY>
X-Marlon-Llm-Key: <LLM_API_KEY>
```

Работает **только** для путей `/api/llm/*`.

### B) Логин аудитора

1. `POST /api/auth/login` `{ "email", "password" }` → `token`
2. `Authorization: Bearer <token>`

База: `https://audit-api.bank-future.com` (prod).

---

## Endpoints

### Статус

```http
GET /api/llm/status
Authorization: Bearer …
```

### Список моделей

```http
GET /api/llm/models
Authorization: Bearer …
```

Ответ: `default`, `known[]`, при доступности Ollama — `ollama[]`.

### Простой chat (рекомендуется)

```http
POST /api/llm/chat
Authorization: Bearer …
Content-Type: application/json
```

```json
{
  "message": "Объясни что такое ОСВ одной фразой",
  "model": "qwen2.5:7b-instruct",
  "temperature": 0.2
}
```

или полный диалог:

```json
{
  "messages": [
    { "role": "system", "content": "Отвечай кратко по-русски" },
    { "role": "user", "content": "Что такое РЕПО?" }
  ],
  "model": "qwen3.6:27b",
  "max_tokens": 1024
}
```

Ответ:

```json
{
  "ok": true,
  "content": "…",
  "model": "qwen2.5:7b-instruct",
  "provider": "openai",
  "latency_ms": 1234
}
```

### OpenAI-совместимый

```http
POST /api/llm/v1/chat/completions
Authorization: Bearer …
Content-Type: application/json
```

```json
{
  "model": "qwen2.5:7b-instruct",
  "messages": [
    { "role": "user", "content": "ping" }
  ],
  "temperature": 0
}
```

Формат ответа как у OpenAI (`choices[0].message.content`).

### Ping

```http
POST /api/llm/ping
{ "prompt": "ping", "model": "gemma3:27b" }
```

---

## Примеры curl

```bash
# service key (предпочтительно для тестов)
export LLM_KEY='…'   # тот же, что LLM_API_KEY на Immers

curl -sS -X POST https://audit-api.bank-future.com/api/llm/chat \
  -H "Authorization: Bearer $LLM_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"message":"Скажи привет одним словом","model":"qwen2.5:7b-instruct"}'

# или
curl -sS -X POST https://audit-api.bank-future.com/api/llm/chat \
  -H "X-Api-Key: $LLM_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"message":"ping","model":"qwen3.6:27b"}'
```

Python (openai SDK):

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://audit-api.bank-future.com/api/llm/v1",
    api_key="<LLM_API_KEY>",  # service key или JWT аудитора
)
r = client.chat.completions.create(
    model="qwen2.5:7b-instruct",
    messages=[{"role": "user", "content": "Привет"}],
)
print(r.choices[0].message.content)
```

---

## Ограничения

- Не для vision-картинок через этот thin API (vision — отдельный pipeline OCR).
- Таймаут: `LLM_TIMEOUT_MS` (на Immers часто 180000).
- Нагрузка: модели 27B — очередь/CPU; не долбите параллельно без нужды.
- Это **не** публичный open AI: только с учёткой аудитора.

---

## Код

- Клиент: `server/llm_client.js`
- Роуты: `server/routes/index.js` → `createLlmRoutes` → mount `/api/llm`
