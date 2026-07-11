# Что передать в другой проект (секреты — вручную)

**В эту папку не кладём реальные ключи.** Скопируй значения сам в `.env` целевого проекта или в менеджер секретов.

## Обязательно

| Имя | Где взять у PFP / BankFuture |
|-----|------------------------------|
| `OPENROUTER_API_KEY` | Тот же ключ, что в PFP `.env.production` на Immers, или новый на [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_PROXY_URL` | **Прод:** `socks5://45.77.80.63:10809` |
| `TELEGRAM_PROXY_URL` | Тот же SOCKS (если в проекте есть Telegram) |

## Опционально

| Имя | Значение по умолчанию |
|-----|----------------------|
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` |
| `OPENROUTER_MODEL` | `google/gemma-3-27b-it` (или `google/gemini-3.5-flash` как на проде PFP) |
| `OPENROUTER_HTTP_TIMEOUT_MS` | `30000` |

## Локальная разработка

1. SSH к Vultr (ключ `vultr_miami` или свой):  
   `ssh -D 127.0.0.1:10809 -N root@45.77.80.63`
2. В локальном `.env`:
   - `OPENROUTER_PROXY_URL=socks5://127.0.0.1:10809`
   - `OPENROUTER_API_KEY` — dev-ключ или тот же prod (осторожно с лимитами)

## VPS (если поднимаешь прокси с нуля)

- **IP Vultr (Miami):** `45.77.80.63`
- **SOCKS порт (рабочий):** `10809`
- **HTTP Squid `:3128`:** не использовать для OpenRouter
- **Firewall:** порт 10809 только с IP Immers `81.94.159.209` + твой dev IP

## Чеклист передачи коллеге

- [ ] Папка `export/openrouter-immers-proxy-kit/` (zip или копия из репо)
- [ ] `OPENROUTER_API_KEY` — в личку / 1Password, не в git
- [ ] Доступ SSH на Vultr (если нужен локальный туннель)
- [ ] Ссылка на `docs/IMMERS_DEPLOY.md` в репо PFP (секция Telegram/OpenRouter proxy)
