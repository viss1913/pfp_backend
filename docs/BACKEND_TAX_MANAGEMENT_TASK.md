# Задача: Реализация API для управления налоговыми ставками 2НДФЛ

## Контекст
Фронтенд-разработчик уже реализовал UI для управления налоговыми ставками 2НДФЛ в админке. Необходимо реализовать бэкенд API endpoints для поддержки этой функциональности.

**Важно:** Фронтенд уже готов и ожидает эти endpoints. При отсутствии endpoints возвращается ошибка 404.

## Описание задачи
Реализовать REST API для управления прогрессивной шкалой налогообложения 2НДФЛ. API должно поддерживать:
- Получение списка всех налоговых ставок
- Получение ставки по ID
- Поиск ставки для конкретного дохода
- Создание новой ставки (admin only)
- Обновление существующей ставки (admin only)
- Удаление ставки (admin only)
- Массовое создание ставок (admin only)

## Модель данных

### Таблица: `tax_2ndfl_brackets` (или аналогичная)

```sql
CREATE TABLE tax_2ndfl_brackets (
    id SERIAL PRIMARY KEY,
    income_from DECIMAL(15, 2) NOT NULL CHECK (income_from >= 0),
    income_to DECIMAL(15, 2) NOT NULL CHECK (income_to >= 0),
    rate DECIMAL(5, 2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    order_index INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tax_brackets_order ON tax_2ndfl_brackets(order_index, income_from);
CREATE INDEX idx_tax_brackets_income ON tax_2ndfl_brackets(income_from, income_to);
```

### JSON Schema

**Tax2ndflBracket (Response):**
```json
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
```

**Tax2ndflBracketCreate (Request):**
```json
{
  "income_from": 0,        // обязательное, number >= 0
  "income_to": 5000000,    // обязательное, number >= 0
  "rate": 13.0,            // обязательное, number 0-100
  "order_index": 1,        // опциональное, integer >= 0
  "description": "..."     // опциональное, string
}
```

**Tax2ndflBracketUpdate (Request):**
```json
{
  "income_from": 0,        // опциональное, number >= 0
  "income_to": 5000000,   // опциональное, number >= 0
  "rate": 13.0,            // опциональное, number 0-100
  "order_index": 1,        // опциональное, integer >= 0
  "description": "..."     // опциональное, string
}
```

## API Endpoints

Базовый путь: `/api/pfp/settings/tax-2ndfl/brackets`

Все endpoints требуют авторизации через Bearer token.

### 1. GET `/api/pfp/settings/tax-2ndfl/brackets`
Получить все налоговые ставки.

**Авторизация:** Любой авторизованный пользователь

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
  },
  {
    "id": 2,
    "income_from": 5000001,
    "income_to": 20000000,
    "rate": 15.0,
    "order_index": 2,
    "description": "Повышенная ставка 15%",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

**Требования:**
- Возвращать все ставки, отсортированные по `order_index` (по возрастанию), затем по `income_from` (по возрастанию)
- Если ставок нет, возвращать пустой массив `[]`

---

### 2. GET `/api/pfp/settings/tax-2ndfl/brackets/{id}`
Получить налоговую ставку по ID.

**Авторизация:** Любой авторизованный пользователь

**Path Parameters:**
- `id` (integer, required) - ID налоговой ставки

**Response 200:**
```json
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
```

**Response 404:**
```json
{
  "error": "Tax bracket not found",
  "message": "Tax bracket with id 123 not found"
}
```

---

### 3. GET `/api/pfp/settings/tax-2ndfl/brackets/by-income/{income}`
Найти налоговую ставку для конкретного дохода.

**Авторизация:** Любой авторизованный пользователь

**Path Parameters:**
- `income` (number, required) - Годовой доход в рублях

**Логика поиска:**
- Найти ставку, где `income_from <= income <= income_to`
- Если найдено несколько (не должно быть при правильных данных), вернуть первую
- Если не найдено, вернуть 404

**Response 200:**
```json
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
```

**Response 404:**
```json
{
  "error": "Tax bracket not found",
  "message": "No tax bracket found for income 10000000"
}
```

---

### 4. POST `/api/pfp/settings/tax-2ndfl/brackets`
Создать новую налоговую ставку.

**Авторизация:** Только администратор (admin role)

**Request Body:**
```json
{
  "income_from": 0,
  "income_to": 5000000,
  "rate": 13.0,
  "order_index": 1,
  "description": "Стандартная ставка 13%"
}
```

**Валидация:**
1. `income_from` - обязательное, number >= 0
2. `income_to` - обязательное, number >= 0
3. `rate` - обязательное, number >= 0 AND <= 100
4. `order_index` - опциональное, integer >= 0 (если не указано, использовать максимальный order_index + 1)
5. `description` - опциональное, string
6. **Проверка:** `income_to > income_from` (строго больше)
7. **Проверка пересечений:** Новый диапазон `[income_from, income_to]` не должен пересекаться с существующими диапазонами

**Алгоритм проверки пересечений:**
```
Диапазоны пересекаются, если:
(income_from <= existing.income_to) AND (income_to >= existing.income_from)
```

**Response 201:**
```json
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
```

**Response 400 (Validation Error):**
```json
{
  "error": "Validation error",
  "message": "income_to must be greater than income_from"
}
```

**Response 400 (Overlapping Brackets):**
```json
{
  "error": "Overlapping brackets",
  "message": "Income range [0, 5000000] overlaps with existing bracket [0, 5000000] (id: 1)"
}
```

**Response 403:**
```json
{
  "error": "Forbidden",
  "message": "Only administrators can manage tax brackets"
}
```

---

### 5. PUT `/api/pfp/settings/tax-2ndfl/brackets/{id}`
Обновить налоговую ставку.

**Авторизация:** Только администратор (admin role)

**Path Parameters:**
- `id` (integer, required) - ID налоговой ставки

**Request Body:** Все поля опциональны (partial update)
```json
{
  "income_from": 0,
  "income_to": 6000000,
  "rate": 13.0,
  "order_index": 1,
  "description": "Обновленное описание"
}
```

**Валидация:**
1. Все поля опциональны
2. Если указаны `income_from` и `income_to`, проверять: `income_to > income_from`
3. Если указан `rate`, проверять: `0 <= rate <= 100`
4. **Проверка пересечений:** Обновленный диапазон не должен пересекаться с другими существующими ставками (кроме текущей)

**Response 200:**
```json
{
  "id": 1,
  "income_from": 0,
  "income_to": 6000000,
  "rate": 13.0,
  "order_index": 1,
  "description": "Обновленное описание",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T12:00:00.000Z"
}
```

**Response 400:** Аналогично POST
**Response 403:** Аналогично POST
**Response 404:**
```json
{
  "error": "Tax bracket not found",
  "message": "Tax bracket with id 123 not found"
}
```

---

### 6. DELETE `/api/pfp/settings/tax-2ndfl/brackets/{id}`
Удалить налоговую ставку.

**Авторизация:** Только администратор (admin role)

**Path Parameters:**
- `id` (integer, required) - ID налоговой ставки

**Response 204:** No Content (успешное удаление)

**Response 403:**
```json
{
  "error": "Forbidden",
  "message": "Only administrators can manage tax brackets"
}
```

**Response 404:**
```json
{
  "error": "Tax bracket not found",
  "message": "Tax bracket with id 123 not found"
}
```

---

### 7. POST `/api/pfp/settings/tax-2ndfl/brackets/bulk`
Массовое создание налоговых ставок.

**Авторизация:** Только администратор (admin role)

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

**Валидация:**
1. `brackets` - обязательное, массив, минимум 1 элемент
2. Для каждой ставки в массиве применяются те же правила валидации, что и для POST
3. **Проверка пересечений:** 
   - Между ставками в запросе не должно быть пересечений
   - Ставки в запросе не должны пересекаться с существующими ставками в БД

**Логика:**
- Если хотя бы одна ставка невалидна или пересекается, вернуть ошибку 400 для всей операции
- Если все валидны, создать все ставки в одной транзакции (atomic operation)

**Response 201:**
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
  },
  {
    "id": 2,
    "income_from": 5000001,
    "income_to": 20000000,
    "rate": 15.0,
    "order_index": 2,
    "description": "Повышенная ставка 15%",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

**Response 400:**
```json
{
  "error": "Validation error",
  "message": "Bracket at index 1 overlaps with bracket at index 0"
}
```

**Response 403:** Аналогично POST

---

## Бизнес-логика и валидация

### 1. Проверка пересечения диапазонов

Диапазоны `[a_from, a_to]` и `[b_from, b_to]` пересекаются, если:
```
(a_from <= b_to) AND (a_to >= b_from)
```

**Примеры:**
- `[0, 5000000]` и `[5000001, 10000000]` - НЕ пересекаются ✅
- `[0, 5000000]` и `[5000000, 10000000]` - НЕ пересекаются ✅ (границы не включены)
- `[0, 5000000]` и `[4000000, 6000000]` - пересекаются ❌
- `[0, 5000000]` и `[1000000, 2000000]` - пересекаются ❌ (второй внутри первого)

### 2. Автоматическое назначение order_index

Если `order_index` не указан при создании:
- Использовать `MAX(order_index) + 1` из существующих ставок
- Если ставок нет, использовать `0`

### 3. Обновление updated_at

При каждом обновлении записи автоматически обновлять поле `updated_at` на текущее время.

---

## Права доступа

### GET endpoints (list, get, getByIncome)
- **Доступ:** Любой авторизованный пользователь (с валидным Bearer token)

### POST, PUT, DELETE endpoints (create, update, delete, bulkCreate)
- **Доступ:** Только пользователи с ролью `admin` или `ADMIN`
- **Проверка:** Проверять роль пользователя из JWT token
- **Ошибка:** Если пользователь не администратор, возвращать 403 Forbidden

---

## Примеры использования

### Пример 1: Создание прогрессивной шкалы

**Запрос:**
```bash
POST /api/pfp/settings/tax-2ndfl/brackets/bulk
Authorization: Bearer {admin_token}
Content-Type: application/json

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
    },
    {
      "income_from": 20000001,
      "income_to": 50000000,
      "rate": 20.0,
      "order_index": 3,
      "description": "Высокая ставка 20%"
    }
  ]
}
```

### Пример 2: Поиск ставки для дохода

**Запрос:**
```bash
GET /api/pfp/settings/tax-2ndfl/brackets/by-income/3000000
Authorization: Bearer {token}
```

**Ответ:** Ставка с `income_from <= 3000000 <= income_to`

---

## Важные замечания

1. **Атомарность операций:** Массовое создание должно быть атомарным (транзакция). Если хотя бы одна ставка невалидна, откатить все изменения.

2. **Производительность:** 
   - Использовать индексы на `income_from`, `income_to` для быстрого поиска пересечений
   - Использовать индекс на `order_index` для сортировки

3. **Консистентность данных:**
   - Не допускать пересечений диапазонов
   - Проверять валидность данных на уровне БД (constraints) и на уровне приложения

4. **Обработка ошибок:**
   - Всегда возвращать понятные сообщения об ошибках
   - Указывать, какая именно ставка или поле вызвало ошибку

5. **OpenAPI спецификация:**
   - Обновить файл `OPENAPI_SPEC.yaml` (раздел уже есть, нужно убедиться, что реализация соответствует)

---

## Тестирование

Рекомендуемые тест-кейсы:

1. ✅ Создание валидной ставки
2. ✅ Создание ставки с пересекающимся диапазоном (должна быть ошибка 400)
3. ✅ Обновление ставки с проверкой пересечений
4. ✅ Массовое создание валидных ставок
5. ✅ Массовое создание с пересечениями (должна быть ошибка 400)
6. ✅ Поиск ставки для дохода (существующий и несуществующий)
7. ✅ Проверка прав доступа (admin vs обычный пользователь)
8. ✅ Удаление несуществующей ставки (404)
9. ✅ Валидация полей (отрицательные значения, rate > 100, и т.д.)

---

## Контакты

Если есть вопросы по спецификации, обращайтесь к фронтенд-разработчику или проверьте файл `OPENAPI_SPEC.yaml` для полной спецификации API.

**Статус фронтенда:** ✅ Готов и ожидает endpoints
**Приоритет:** Высокий (фронтенд уже реализован)

