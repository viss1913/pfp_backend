# OpenRouter + SOCKS proxy kit (Immers / РФ VPS)

Готовый набор для **другого Node-проекта**, если OpenRouter с датацентра (Immers, Railway DC и т.п.) отвечает:

```json
{ "success": false, "error": "Access denied by security policy." }
```

Проверено на PFP (jul 2026): **напрямую 403**, через **SOCKS5 на Vultr — OK**.

---

## Что положить в новый проект

| Файл из этой папки | Куда в целевом проекте |
|--------------------|-------------------------|
| `openrouterProxy.js` | `src/utils/openrouterProxy.js` (или `lib/`) |
| `env.example` | скопировать строки в `.env` / `.env.production` |
| `scripts/test_openrouter_proxy.js` | `scripts/` |
| `scripts/test_ai_connection.js` | `scripts/` (опционально) |
| `snippets/integrate-axios.example.js` | только как образец, не копировать слепо |

**Зависимость:**

```bash
npm install axios socks-proxy-agent dotenv
```

---

## Секреты (передаёшь вручную, не коммитить)

Эти значения **не лежат в kit** — возьми у себя или у команды:

| Переменная | Откуда | Зачем |
|------------|--------|--------|
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) | Bearer для API |
| `OPENROUTER_PROXY_URL` | см. ниже | egress к OpenRouter |
| `TELEGRAM_PROXY_URL` | тот же SOCKS (если есть Telegram-бот) | fallback для LLM |

### Прод (Immers + Vultr) — рабочая схема PFP

```env
OPENROUTER_API_KEY=sk-or-v1-ВАШ_КЛЮЧ
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=google/gemma-3-27b-it

# Рабочий egress (SOCKS на Vultr Miami)
OPENROUTER_PROXY_URL=socks5://45.77.80.63:10809
TELEGRAM_PROXY_URL=socks5://45.77.80.63:10809
```

**Не использовать** для OpenRouter:

```env
OPENROUTER_PROXY_URL=http://45.77.80.63:3128
```

HTTP Squid на `:3128` даёт **503** — для LLM не подходит (для Telegram у нас отдельный SOCKS).

### Локально (Windows / dev)

1. Поднять SSH-туннель на Vultr (в отдельном терминале, не закрывать):

```bash
ssh -D 127.0.0.1:10809 -N root@45.77.80.63
```

2. В `.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-ВАШ_КЛЮЧ
OPENROUTER_PROXY_URL=socks5://127.0.0.1:10809
TELEGRAM_PROXY_URL=socks5://127.0.0.1:10809
```

Без туннеля локально будет тот же **403**, что и с Immers напрямую.

---

## Интеграция в код (axios)

```js
const { openrouterAxiosExtras } = require('./utils/openrouterProxy');

await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    { model, messages, stream: false },
    {
        headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://your-app.example',
            'X-Title': 'Your App',
        },
        ...openrouterAxiosExtras(),
    }
);
```

Полный пример: `snippets/integrate-axios.example.js`.

Логика выбора прокси в `openrouterProxy.js`:

1. Берёт `OPENROUTER_PROXY_URL`, иначе `TELEGRAM_PROXY_URL`
2. **Предпочитает SOCKS** перед HTTP (если заданы оба)
3. Для SOCKS: `socks5://` → `socks5h://` (DNS на стороне прокси)

---

## Smoke-тесты

Из корня целевого проекта (после копирования файлов и `npm i`):

```bash
# Сравнение: direct / http / socks
node scripts/test_openrouter_proxy.js

# Минимальный тест как в PFP
node scripts/test_ai_connection.js
```

Ожидание на Immers / с туннелем локально:

```
[openrouterProxy] OpenRouter uses socks5 → remote DNS, host=... port=10809
OK: Pong! ...
```

Плохие знаки:

| Симптом | Причина |
|---------|---------|
| `403 Access denied by security policy` | Запрос **без** SOCKS или ключ/политика OpenRouter |
| `503` + HTML Squid | Используется HTTP `:3128` вместо SOCKS |
| `ECONNREFUSED 127.0.0.1:10809` | Локально не поднят `ssh -D` |

---

## Docker / prod deploy

1. Скопировать `openrouterProxy.js` + правки в сервис LLM
2. В `.env.production` выставить `OPENROUTER_PROXY_URL=socks5://45.77.80.63:10809`
3. `docker compose restart backend` (или аналог)
4. В логах при первом LLM-запросе: `[openrouterProxy] OpenRouter uses socks5...`
5. `docker compose exec backend node scripts/test_openrouter_proxy.js`

---

## Firewall на Vultr

SOCKS `:10809` должен принимать подключения **только с IP бэкенда** (Immers `81.94.159.209` и твой домашний IP для dev-туннеля). Иначе прокси утащат чужие.

---

## Источник в репо PFP

- Утилита: `src/utils/openrouterProxy.js`
- Подключение: `src/services/aiService.js` → `...openrouterAxiosExtras()`
- Telegram (отдельно): `src/utils/telegramProxy.js`
- Деплой: `docs/IMMERS_DEPLOY.md`

Kit синхронизирован с прод-фиксом от **2026-07-11**.
