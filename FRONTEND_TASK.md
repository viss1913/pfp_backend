# Задача для Frontend разработчика (AI)

## Контекст
Мы разрабатываем административную панель для управления продуктами и портфелями (Personal Financial Planning - PFP).
Бэкенд обновлен и готов. Необходимо реализовать интерфейс управления **Портфелями**.

## API и Документация
- **OpenAPI Spec**: См. файл `OPENAPI_SPEC.yaml` (который передан вместе с этим заданием).
- **Base URL**: `/api`

## Основные изменения в API (Важно!)
В структуре Портфеля произошли важные изменения:
1. Поле `top_up` в массиве `risk_profiles` переименовано в **`initial_replenishment`**.
2. В объекте инструмента (`RiskProfile -> instruments`) поле `bucket_type` теперь принимает значения: `['INITIAL_CAPITAL', 'INITIAL_REPLENISHMENT']` (раньше было `TOP_UP`).
3. Поле `potential_yield_percent` удалено из входящих данных (оно рассчитывается на бэкенде).

## Задача: Секция "Портфели" (Portfolios)

Необходимо реализовать CRUD интерфейс для сущности `Portfolio`.

### 1. Список портфелей (`GET /portfolios`)
- Таблица с колонками:
  - ID
  - Название (Name)
  - Валюта (Currency)
  - Диапазоны (Сумма от/до, Срок от/до)
  - Статус (Активен/Нет)
  - Действия: Редактировать, Клонировать, Удалить.

### 2. Форма Создания/Редактирования Портфеля
**Основные поля:**
- Name (String)
- Currency (Select: RUB/USD/etc, default RUB)
- Суммы: Amount From / Amount To
- Сроки (мес): Term From / Term To
- Возраст инвестора: Age From / Age To
- Тип инвестора: Select (QUALIFIED, etc)
- Gender: Select (Male/Female/Any)
- Asset Classes: Multi-select (IDs классов)

**Настройка Риск-профилей (Risk Profiles):**
Это сложная часть формы. Портфель содержит массив `risk_profiles`.
Обычно их 3 типа: `CONSERVATIVE`, `BALANCED`, `AGGRESSIVE`.

Интерфейс должен позволять для каждого профиля настроить:
1. **Initial Capital (Стартовый капитал)**:
   - Список продуктов.
   - Пользователь выбирает Продукт (Product ID) и указывает Долю (Share %).
   - *Валидация*: Сумма долей должна быть 100%.

2. **Initial Replenishment (Пополнения)** (бывший `top_up`):
   - Аналогичный список продуктов и долей для регулярных взносов.
   - *Валидация*: Сумма долей должна быть 100% (если список не пуст).

### 3. Действия
- **Сохранение (`POST/PUT`)**: Отправлять JSON в соответствии с новой схемой.
- **Клонирование (`POST /portfolios/:id/clone`)**: Кнопка в списке или на детальной странице. Позволяет создать копию базового портфеля для редактирования агентом.
- **Удаление (`DELETE`)**.

## Пример JSON (Payload)

```json
{
  "name": "Сбалансированный портфель",
  "currency": "RUB",
  "amount_from": 100000,
  "amount_to": 1000000,
  "term_from_months": 12,
  "term_to_months": 60,
  "age_from": 25,
  "age_to": 55,
  "investor_type": "QUALIFIED",
  "classes": [1, 3, 5],
  "risk_profiles": [
    {
      "profile_type": "BALANCED",
      "initial_capital": [
        { "product_id": 101, "share_percent": 40, "order_index": 1 },
        { "product_id": 102, "share_percent": 60, "order_index": 2 }
      ],
      "initial_replenishment": [
        { "product_id": 101, "share_percent": 50, "order_index": 1 },
        { "product_id": 102, "share_percent": 50, "order_index": 2 }
      ]
    },
    {
      "profile_type": "AGGRESSIVE",
      "initial_capital": [
        { "product_id": 205, "share_percent": 100, "order_index": 1 }
      ],
      "initial_replenishment": [] 
    }
  ]
}
```
