# Обновление API: Налоговые ставки 2НДФЛ готовы к использованию

## ✅ Статус
API для управления налоговыми ставками 2НДФЛ полностью реализовано и исправлено. Все endpoints работают корректно.

## 📍 Базовый путь
```
/api/pfp/settings/tax-2ndfl/brackets
```

## 🔗 Доступные endpoints

### 1. Получить все ставки
```
GET /api/pfp/settings/tax-2ndfl/brackets
Authorization: Bearer {token}
```
**Доступ:** Любой авторизованный пользователь

**Response 200:**
```json
[
  {
    "id": 1,
    "income_from": 0,
    "income_to": 5000000,
    "rate": 13.0,
    "order_index": 1,
    "description": "Стандартная ставка 13%",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

### 2. Получить ставку по ID
```
GET /api/pfp/settings/tax-2ndfl/brackets/{id}
Authorization: Bearer {token}
```

### 3. Найти ставку для дохода
```
GET /api/pfp/settings/tax-2ndfl/brackets/by-income/{income}
Authorization: Bearer {token}
```
**Пример:** `GET /api/pfp/settings/tax-2ndfl/brackets/by-income/3000000`

### 4. Создать ставку (admin only)
```
POST /api/pfp/settings/tax-2ndfl/brackets
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "income_from": 0,
  "income_to": 5000000,
  "rate": 13.0,
  "order_index": 1,        // опционально
  "description": "..."      // опционально
}
```

**Обязательные поля:**
- `income_from` (number >= 0)
- `income_to` (number >= 0, должно быть > income_from)
- `rate` (number 0-100)

**Response:** 201 Created (возвращает созданный объект)

### 5. Обновить ставку (admin only)
```
PUT /api/pfp/settings/tax-2ndfl/brackets/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:** Все поля опциональны (partial update)

### 6. Удалить ставку (admin only)
```
DELETE /api/pfp/settings/tax-2ndfl/brackets/{id}
Authorization: Bearer {token}
```

**Response:** 204 No Content

### 7. Массовое создание (admin only)
```
POST /api/pfp/settings/tax-2ndfl/brackets/bulk
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "brackets": [
    {
      "income_from": 0,
      "income_to": 5000000,
      "rate": 13.0,
      "order_index": 1,
      "description": "Стандартная ставка 13%"
    },
    {
      "income_from": 5000001,
      "income_to": 20000000,
      "rate": 15.0,
      "order_index": 2,
      "description": "Повышенная ставка 15%"
    }
  ]
}
```

**Response:** 201 Created (массив созданных ставок)

## ⚠️ Формат ошибок

Все ошибки возвращаются в едином формате:

```json
{
  "error": "Error Type",
  "message": "Detailed error message"
}
```

### Примеры ошибок:

**400 Validation Error:**
```json
{
  "error": "Validation error",
  "message": "income_to must be greater than income_from"
}
```

**400 Overlapping Brackets:**
```json
{
  "error": "Overlapping brackets",
  "message": "Income range [0, 5000000] overlaps with existing bracket [0, 5000000] (id: 1)"
}
```

**403 Forbidden:**
```json
{
  "error": "Forbidden",
  "message": "Only administrators can manage tax brackets"
}
```

**404 Not Found:**
```json
{
  "error": "Tax bracket not found",
  "message": "Tax bracket with id 123 not found"
}
```

или для поиска по доходу:
```json
{
  "error": "Tax bracket not found",
  "message": "No tax bracket found for income 10000000"
}
```

## 🔍 Важные моменты

1. **Автоматическое назначение order_index:**
   - Если `order_index` не указан при создании, он автоматически назначается как `MAX(order_index) + 1`
   - Если ставок нет, используется `0`

2. **Валидация диапазонов:**
   - `income_to` должно быть строго больше `income_from`
   - Диапазоны не должны пересекаться
   - При попытке создать/обновить с пересекающимся диапазоном вернется ошибка 400

3. **Сортировка:**
   - Ставки возвращаются отсортированными по `order_index` (по возрастанию), затем по `income_from` (по возрастанию)

4. **Атомарность bulk create:**
   - При массовом создании все ставки создаются в одной транзакции
   - Если хотя бы одна ставка невалидна, все изменения откатываются

## 📚 Документация

Полная спецификация API доступна в:
- `OPENAPI_SPEC.yaml` (раздел `/pfp/settings/tax-2ndfl/brackets`)
- `FRONTEND_TAX_MANAGEMENT_TASK.md` - детальное описание для фронтенда
- `BACKEND_TAX_MANAGEMENT_TASK.md` - техническая спецификация

## 🚀 Готово к использованию

Все endpoints протестированы и готовы к использованию. Если возникнут вопросы или проблемы, обращайтесь!




















