# Секреты и доступ (наш Vultr)

**В архив партнёрам не класть:** SSH-ключи, пароли Vultr, чужие API-ключи.

## Что можно отдать партнёру

| Что | Значение |
|-----|----------|
| SOCKS URL | `socks5://45.77.80.63:10809` |
| Документ | `HANDOFF_SHARED_VULTR.md` + код из этой папки |
| Их `OPENROUTER_API_KEY` | они создают сами |

## Что НЕ отдавать по умолчанию

- SSH `root@45.77.80.63` / ключ `vultr_miami`
- Логин в панель Vultr
- Наш prod `OPENROUTER_API_KEY`

## Перед доступом партнёра

1. Получить **публичный IP их бэкенда**
2. На Vultr firewall: разрешить TCP `10809` с этого IP (как уже для Immers `81.94.159.209`)
3. Smoke с их стороны: `node scripts/test_ai_connection.js`

## Наш внутренний SSH (не для партнёров)

```bash
ssh -i ~/.ssh/vultr_miami root@45.77.80.63
```

Локальный туннель для своего dev:

```bash
ssh -i ~/.ssh/vultr_miami -D 127.0.0.1:10809 -N root@45.77.80.63
# OPENROUTER_PROXY_URL=socks5://127.0.0.1:10809
```
