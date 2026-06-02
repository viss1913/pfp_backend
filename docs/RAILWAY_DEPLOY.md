# 🚀 Деплой на Railway

## Пошаговая инструкция

### 1. Создайте проект в Railway

1. Перейдите на [railway.app](https://railway.app)
2. Нажмите **"New Project"**
3. Выберите **"Deploy from GitHub repo"**
4. Выберите репозиторий `viss1913/pfp_backend`

### 2. Добавьте MySQL базу данных

1. В проекте нажмите **"+ New"** → **"Database"** → **"Add MySQL"**
2. Railway автоматически создаст базу и переменную `MYSQL_URL`

### 3. Настройте переменные окружения

Railway автоматически создаст `MYSQL_URL`, но вы можете добавить дополнительные переменные в **Settings → Variables** (или **Variables** у сервиса бэкенда):

```env
NODE_ENV=production
PORT=3000
```

**Важно:** Переменная `MYSQL_URL` уже содержит все данные для подключения к БД, дополнительные `DB_HOST`, `DB_USER` и т.д. **не нужны**.

#### ИИ (конструктор B2C, чаты в т.ч. Ростех, Telegram и любые вызовы через `aiService`)

Один и тот же стек: `src/services/aiService.js` (OpenRouter). Рекомендуется **явно** задать модель на проде:

```env
OPENROUTER_API_KEY=sk-or-v1-...   # уже должен быть
OPENROUTER_MODEL=google/gemma-3-27b-it
```

Без `OPENROUTER_MODEL` после деплоя возьмётся дефолт из кода (сейчас тот же `google/gemma-3-27b-it`). Переменная на проде нужна, чтобы менять модель без релиза.

Через [Railway CLI](https://docs.railway.com/develop/cli) (после `railway login` и `railway link` в каталоге проекта):

```bash
railway variables --set "OPENROUTER_MODEL=google/gemma-3-27b-it"
```

### 4. Деплой

Railway автоматически:
1. Установит зависимости (`npm install`)
2. Выполнит `npm run build` (запустит миграции)
3. Запустит сервер (`npm start`)

### 5. Заполните начальные данные (опционально)

После первого успешного деплоя:

1. Откройте **Railway Dashboard** → ваш сервис
2. Перейдите в **Settings** → **Service Variables**
3. Нажмите **"Deploy"** → **"Run Command"**
4. Выполните команду:
   ```bash
   npm run seed
   ```

Это создаст:
- Продукт **ПДС НПФ**
- 4 портфеля (Пенсия, Пассивный доход, Инвестиции, Прочее)
- Системные настройки

### 6. Проверьте работу API

После деплоя Railway предоставит публичный URL (например, `https://pfp-backend-production.up.railway.app`)

Откройте в браузере:
```
https://ваш-домен.railway.app/api-docs
```

Вы увидите Swagger UI с документацией API.

## 🔍 Проверка статуса

### Логи
В Railway Dashboard → **Deployments** → выберите деплой → **View Logs**

### Тестовый запрос
```bash
curl https://ваш-домен.railway.app/api/pfp/settings \
  -H "x-agent-id: 1"
```

Должен вернуть список системных настроек.

## ⚙️ Переменные окружения в Railway

Railway автоматически предоставляет:
- `MYSQL_URL` - полный URL подключения к MySQL
- `PORT` - порт для веб-сервера (обычно 3000)

Код автоматически парсит `MYSQL_URL` и использует его для подключения к БД.

Для LLM дополнительно: `OPENROUTER_API_KEY`, опционально `OPENROUTER_MODEL` (см. раздел «ИИ» выше).

## 🐛 Troubleshooting

### Миграции не выполнились
Проверьте логи деплоя. Если миграции упали, выполните вручную:
```bash
npm run migrate
```

### База данных не подключается
Убедитесь, что:
1. MySQL плагин добавлен в проект
2. Переменная `MYSQL_URL` существует
3. Сервис и база в одном проекте Railway

### Порт не работает
Railway автоматически устанавливает `PORT`. Код использует `process.env.PORT || 3000`.

## 📈 Макро / инфляция без shell (Run Command)

На Railway не обязательно заходить в консоль: **cron уже крутится внутри процесса** (`macroScheduler.js`, четверг 10:30 — ИПЦ г/г + Росстат).

Если данные устарели сразу после публикации ЦБ/Росстата:

1. **Variables** сервиса бэкенда → добавьте `MACRO_CRON_SECRET` (длинная случайная строка).
2. Задеплойте последний коммит (есть `POST /api/pfp/macro/cron/inflation` и авто-sync при старте, если ряд старше ~8 дней).
3. Один раз дерните из браузера, Postman или с ПК:

```bash
curl.exe -X POST "https://pfpbackend-production.up.railway.app/api/pfp/macro/cron/inflation" ^
  -H "x-macro-cron-secret: ВАШ_MACRO_CRON_SECRET"
```

Опционально с месячным Росстатом: `?monthly=1`.

Проверка после sync (нужен обычный JWT агента): `GET /api/pfp/macro/latest` → поле `inflation_yoy`.

**Railway Cron Job** (если включён в тарифе): расписание `30 10 * * 4`, метод POST, URL как выше, заголовок `x-macro-cron-secret`.

Логи: Dashboard → Deployments → View Logs — строки `[macroStartup]` или `Cron inflation sync`.

## 📝 Полезные команды в Railway CLI

```bash
# Установка Railway CLI
npm i -g @railway/cli

# Логин
railway login

# Подключение к проекту
railway link

# Просмотр логов
railway logs

# Выполнение команд
railway run npm run seed
```

## 🔗 Полезные ссылки

- [Railway Documentation](https://docs.railway.app/)
- [MySQL Plugin Guide](https://docs.railway.app/databases/mysql)
- [Environment Variables](https://docs.railway.app/develop/variables)
