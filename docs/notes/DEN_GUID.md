# Гид для Дэна: Как сделать свой первый сервер с ИИ 🚀

Привет! Это простое руководство, как собрать свой бэкенд на Node.js, который умеет общаться с нейросетями.

## Шаг 0: Что нужно установить
1. **Node.js**: Скачай с [nodejs.org](https://nodejs.org/) (бери версию LTS).
2. **VS Code**: Лучший редактор кода.

---

## Шаг 1: Создаем проект
Открой терминал (в VS Code: `Ctrl + ``) и пиши:

```bash
# Создаем папку
mkdir my-ai-server
cd my-ai-server

# Создаем файл настроек (жми Enter на всё)
npm init -y

# Устанавливаем нужные библиотеки
npm install express openai dotenv cors
```

---

## Шаг 2: Файл с ключами (`.env`)
Никогда не клади ключи прямо в код! Создай файл `.env` в корне папки:

```env
PORT=3000
# Сюда вставь ключ (например, от SiliconFlow или OpenAI)
AI_API_KEY=твой_ключ_тут
```

---

## Шаг 3: Пишем код сервера (`index.js`)
Создай файл `index.js` и вставь этот код:

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json()); // Чтобы сервер понимал JSON
app.use(cors());         // Чтобы фронтенд мог достучаться

// Настраиваем ИИ (пример для SiliconFlow/OpenAI)
const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: "https://api.siliconflow.cn/v1" // Если используешь SiliconFlow
});

// Наш API эндпоинт
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        const response = await openai.chat.completions.create({
            model: "vendor/model-name", // Замени на нужную модель
            messages: [{ role: "user", content: message }],
        });

        res.json({ reply: response.choices[0].message.content });
    } catch (error) {
        console.error("Ошибка:", error);
        res.status(500).json({ error: "Что-то сломалось" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
```

---

## Шаг 4: Как запустить
В терминале напиши:
```bash
node index.js
```

---

## Шаг 5: Как проверить (для фронтенда)
Твой фронтенд (React/Vue/HTML) должен отправить запрос:

```javascript
const response = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "Привет, как дела?" })
});
const data = await response.json();
console.log(data.reply);
```

### Советы новичку:
- **`express`**: Это каркас твоего сервера.
- **`idempotency`**: Это когда повторный запрос не ломает всё (помнишь, как мы чинили удаление?).
- **Логи**: Всегда пиши `console.log`, чтобы видеть, что происходит внутри.

Удачи, Дэн! 🤘
