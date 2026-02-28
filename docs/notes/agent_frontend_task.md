# Задача: Реализация AI Чата в Кабинете Агента

Необходимо реализовать интерфейс для общения агента с ИИ-ассистентами.

## 1. Общее описание
В кабинете агента должен появиться раздел "AI Помощник" (или виджет). Агент может выбрать одного из доступных ассистентов (например, "AI CRM", "AI Продукты") и вести с ним диалог. Ответы от ИИ должны приходить в режиме реального времени (эффект печатания).

## 2. API Методы (см. `openapi/pfp-api.yaml`)
Все запросы требуют авторизации (Bearer Token).

### 2.1. Получение списка ассистентов
*   **Метод**: `GET /api/pfp/ai/assistants`
*   **Ответ**: Массив объектов `{ id, name, slug, description }`.
*   **Использование**: Отобразить список (например, в сайдбаре или как табы) для выбора собеседника.

### 2.2. Получение истории переписки
*   **Метод**: `GET /api/pfp/ai/history/{assistant_id}`
*   **Ответ**: Массив сообщений `{ id, role, content, created_at }`.
*   **Логика**: При выборе ассистента загружать и отображать предыдущие сообщения.
    *   `role: 'user'` — сообщения агента (справа).
    *   `role: 'assistant'` — сообщения ИИ (слева).

### 2.3. Отправка сообщения (Стриминг!)
*   **Метод**: `POST /api/pfp/ai/chat/stream`
*   **Тело**: `{ "assistant_id": 1, "message": "Привет!" }`
*   **Формат ответа**: `text/event-stream` (Server-Sent Events).
*   **Важно**: Это **НЕ** обычный JSON-запрос. Нужно читать поток данных.

#### Пример реализации на JS (Frontend):
```javascript
async function sendMessage(assistantId, text) {
  // 1. Добавляем сообщение пользователя в UI сразу
  addMessageToUI('user', text);

  // 2. Делаем fetch запрос
  const response = await fetch('/api/pfp/ai/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` 
    },
    body: JSON.stringify({ assistant_id: assistantId, message: text })
  });
  
  if (!response.ok) {
     // Обработка ошибки
     return;
  }

  // 3. Создаем пустое сообщение от ассистента в UI
  let botMessageContent = "";
  updateBotMessageInUI(botMessageContent); // Показываем "печатает..." или пустой баббл

  // 4. Читаем поток (SSE)
  // Примечание: В текущей реализации бэкенда данные приходят сырыми чанками текста (raw text)
  // Если используется EventSource, формат был бы 'data: ...'.
  // При fetch + body.getReader() мы получаем просто байты текста.
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    // Декодируем чанк
    const chunk = decoder.decode(value, { stream: true });
    
    // Добавляем к текущему сообщению
    botMessageContent += chunk;
    updateBotMessageInUI(botMessageContent); // Обновляем текст в баббле
  }
}
```

## 3. Требования к UI
1.  **Выбор ассистента**: Показывать доступных ботов (список загружается с бэка).
2.  **Окно чата**: Скроллируемая область. Авто-скролл вниз при новом сообщении.
3.  **Markdown**: ИИ может возвращать разметку (жирный текст, списки). Желательно поддерживать рендеринг Markdown (например, `react-markdown`).
4.  **Обработка ошибок**: Если стрим оборвался или API вернул ошибку — показывать уведомление.

## 4. Ресурсы
*   Полная спецификация методов: файл `openapi/pfp-api.yaml` в репозитории бэкенда.
