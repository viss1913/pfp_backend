# Инструкция по синхронизации агентов (для бэкенда PFP)

Для того чтобы SMM AI корректно авторизовывал агентов и отображал их данные, бэкенд PFP должен отправлять вебхук при создании или обновлении данных агента.

## 1. Параметры запроса

*   **Метод**: `POST`
*   **Путь**: `https://<smm-ai-domain>/api/v1/internal/webhooks/agent-updated`
*   **Заголовки**:
    *   `Content-Type: application/json`
    *   `x-internal-api-key: <INTERNAL_API_KEY>` (Значение берется из переменной окружения SMM AI)

## 2. Формат данных (JSON Payload)

Бэкенд SMM AI ожидает объект со следующими полями:

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `uuid` | String | **Обязательно**. Уникальный ID агента в системе PFP. |
| `email` | String | **Обязательно**. Email агента. |
| `first_name` | String | Имя. |
| `last_name` | String | Фамилия. |
| `middle_name` | String | Отчество. |
| `phone` | String | Телефон. |
| `telegram_channel` | String | Юзернейм или ID канала (например, `@my_channel`). |
| `telegram_channel_id` | String | ID канала (например, `-100123456789`). |
| `region` | String | Регион. |
| `city` | String | Город. |
| `is_active` | Boolean/Number | Статус активности (`true`/`false` или `1`/`0`). |
| `timezone_offset_minutes`| Number | Оффсет таймзоны в минутах (по умолчанию 180). |
| `about_text` | String | Описание ("О себе"). |
| `position_title` | String | Должность (используется, если `about_text` пустой). |

### Пример запроса

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "first_name": "Иван",
  "last_name": "Иванов",
  "email": "ivanov@example.com",
  "telegram_channel": "@ivanov_invest",
  "telegram_channel_id": "-100123456789",
  "is_active": true,
  "timezone_offset_minutes": 180,
  "city": "Москва"
}
```

## 3. Особенности обработки

*   Если в `telegram_channel` передана строка без `@` или `-`, бэкенд SMM AI автоматически добавит префикс `@`.
*   Если агент с таким `uuid` уже существует, его данные будут обновлены. Если нет — будет создан новый агент.
*   Для авторизации в личном кабинете SMM AI использует JWT токены, выпущенные PFP. SMM AI доверяет им, если используется общий `JWT_SECRET`.
