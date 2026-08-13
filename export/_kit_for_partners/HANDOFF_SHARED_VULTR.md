# Доступ к SOCKS-прокси (общий Vultr) для OpenRouter

Пакет для внешней команды: бэкенд ходит в OpenRouter через **наш** SOCKS на Vultr (Miami).

```
[ваш backend] --SOCKS5--> [наш Vultr 45.77.80.63:10809] --> openrouter.ai
```

Без прокси с многих DC в РФ OpenRouter отвечает `403 Access denied by security policy`.

---

## Что выдаём вам

| Параметр | Значение |
|----------|----------|
| Прокси (prod) | `socks5://45.77.80.63:10809` |
| Протокол | SOCKS5 (не HTTP/Squid) |
| Auth на SOCKS | сейчас без логина — доступ только по IP (firewall) |

**Не выдаём без отдельной договорённости:** SSH на Vultr, root, панель Vultr, чужие API-ключи.

**Свой ключ OpenRouter** вы берёте сами: [openrouter.ai/keys](https://openrouter.ai/keys).

---

## Что нужно от вас (обязательно)

1. **Публичный IP бэкенда** (egress), с которого сервер ходит в интернет.  
   Без этого порт `10809` на firewall не откроем — подключение не пройдёт.
2. Контакт на случай смены IP / инцидента.

После получения IP мы добавляем whitelist на Vultr и подтверждаем smoke.

---

## Env на вашем бэкенде

```env
OPENROUTER_API_KEY=sk-or-v1-ВАШ_КЛЮЧ
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=google/gemma-3-27b-it

OPENROUTER_PROXY_URL=socks5://45.77.80.63:10809
```

**Не использовать** для OpenRouter:

```env
# плохо — Squid HTTP часто даёт 503
OPENROUTER_PROXY_URL=http://45.77.80.63:3128
```

---

## Интеграция (Node / axios)

1. `npm i axios socks-proxy-agent dotenv`
2. Скопировать из этого архива `openrouterProxy.js` → например `src/utils/openrouterProxy.js`
3. На запросы к OpenRouter:

```js
const { openrouterAxiosExtras } = require('./utils/openrouterProxy');

await axios.post(
  'https://openrouter.ai/api/v1/chat/completions',
  { model, messages, stream: false },
  {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    ...openrouterAxiosExtras(),
  }
);
```

Хелпер переводит `socks5://` → `socks5h://` (DNS на стороне прокси).

Полный пример: `snippets/integrate-axios.example.js`.  
Зависимости: `package.dependencies.json`.

---

## Smoke

Из окружения бэкенда (тот же IP, что в whitelist):

```bash
# .env с OPENROUTER_API_KEY + OPENROUTER_PROXY_URL
node scripts/test_ai_connection.js
```

Ожидание: `Connection Successful` / OK.  
Плохо: `403` (прокси не используется), timeout/`ECONNREFUSED` (IP ещё не в firewall или неверный порт).

Сравнение direct / socks: `scripts/test_openrouter_proxy.js`.

---

## Правила использования

- Только egress к OpenRouter (и согласованным API), не как общий VPN/сканер.
- Не светить URL прокси публично; не открывать доступ третьим лицам.
- При смене IP бэкенда — сразу написать нам (иначе отрежет firewall).
- Локальная разработка с домашнего IP: либо попросить добавить ваш office/home IP, либо SSH-туннель **если** вам отдельно выдали SSH (обычно нет).

---

## Чеклист онбординга

- [ ] Вы прислали публичный IP бэкенда
- [ ] Мы добавили IP в firewall Vultr `:10809`
- [ ] У вас свой `OPENROUTER_API_KEY`
- [ ] В `.env`: `OPENROUTER_PROXY_URL=socks5://45.77.80.63:10809`
- [ ] Smoke из prod OK

---

## Состав архива

| Файл | Назначение |
|------|------------|
| `HANDOFF_SHARED_VULTR.md` | этот лист |
| `openrouterProxy.js` | хелпер axios |
| `env.example` | шаблон env |
| `package.dependencies.json` | npm deps |
| `snippets/integrate-axios.example.js` | образец |
| `scripts/test_*.js` | smoke |
| `README.md` | расширенная дока |
