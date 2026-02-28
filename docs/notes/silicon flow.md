Ниже вариант описания API для работы с ИИ SiliconFlow (OpenAI‑совместимый), который можно вставить в вашу документацию.

***

## Общее описание

API сервиса **SiliconFlow** предоставляет единый OpenAI‑совместимый интерфейс для работы с LLM‑моделями и другими ИИ‑функциями (чат‑генерация текста, эмбеддинги, мультимодальные запросы и т.п.). Все запросы выполняются по HTTPS с авторизацией через ключ API и принимают/возвращают данные в формате JSON. [siliconflow](https://www.siliconflow.com)

***

## Базовый URL и авторизация

- Базовый URL: `https://api.siliconflow.cn/v1` (OpenAI‑совместимый формат). [github](https://github.com/n8n-io/n8n/issues/21651)
- Авторизация осуществляется через заголовок:
  - `Authorization: Bearer <YOUR_API_KEY>`. [docs.siliconflow](https://docs.siliconflow.com/en/userguide/quickstart)
- Все запросы должны содержать:
  - `Content-Type: application/json`. [github](https://github.com/siliconflow/siliconcloud/blob/main/openapi.yaml)

***

## Основные возможности

API текстовой генерации поддерживает следующие сценарии: [docs.siliconflow](https://docs.siliconflow.cn/en/userguide/capabilities/text-generation)

- Генерация связного текста на основе промпта (чат‑модели и completion‑модели).  
- Семантическое понимание и ведение многошагового диалога с сохранением контекста.  
- Ответы на вопросы по широкому кругу знаний (Q&A).  
- Помощь в программировании: генерация кода, объяснение, рефакторинг и отладка.  

Дополнительно доступны продвинутые функции: [docs.siliconflow](https://docs.siliconflow.cn/en/userguide/capabilities/text-generation)

- Работа с длинным контекстом (до десятков тысяч токенов в зависимости от модели).  
- Точное следование инструкциям (instruction following) и управление стилем ответа через system‑сообщения.  
- Поддержка мультимодальных сценариев (например, описание изображений) для соответствующих моделей.  

***

## Формат запросов к чат‑модели

Стандартный endpoint для чат‑генерации:  

- `POST /chat/completions` (OpenAI‑совместимый маршрут). [doc-en.302](https://doc-en.302.ai/252564719e0)

Тело запроса (пример):

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Напиши краткое описание нашего API." }
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": false
}
```

Параметры управления выводом: [docs.siliconflow](https://docs.siliconflow.cn/en/userguide/capabilities/text-generation)

- `temperature` – степень креативности (0.0–2.0).  
- `max_tokens` – лимит длины ответа в токенах.  
- `stop` – список стоп‑последовательностей, при встрече которых генерация прекращается.  
- `frequency_penalty` – штраф за повторяемость слов (от −2.0 до 2.0).  
- `stream` – включение потоковой передачи ответов (рекомендуется для больших ответов).  

***

## Формат ответов

Успешный ответ чат‑модели возвращается в OpenAI‑совместимом формате: [milvus](https://milvus.io/docs/build_RAG_with_milvus_and_siliconflow.md)

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Ваш сгенерированный ответ..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 120,
    "total_tokens": 129
  }
}
```

Поле `usage` позволяет контролировать расход токенов и оптимизировать стоимость вызовов. [doc-en.302](https://doc-en.302.ai/252564719e0)