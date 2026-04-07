# ТЗ для фронтенд-разработки: Управление клиентами (v2)

Бэкенд обновлен для поддержки полноценного жизненного цикла клиента. Ниже описаны изменения в API и логике интеграции.

## 1. Идентификация (UUID)
При создании или обновлении клиента фронтенд может передавать свой уникальный ID.
- **Поле:** `client.uuid` (строка, например UUID v4).
- **Зачем:** Позволяет фронту знать ID объекта еще до того, как он попадет в БД, что удобно для оффлайн-работы или кэширования.
- **Опционально:** Если не передавать, бэкенд будет использовать только свой внутренний `id`.

## 2. Список клиентов (Dashboard)
Эндпоинт: `GET /api/client/agent-clients`
- **Поиск:** Добавьте строку поиска. При вводе отправляйте запрос с параметром `?search=текст`. Поиск идет по ФИО, телефону, Email и UUID.
- **Пагинация:** По умолчанию лимит снят (приходит весь список). Но эндпоинт готов к `limit` и `page`, если клиентов станет слишком много.
- **Новые поля в объекте:**
  - `external_uuid`: ваш переданный ID.
  - `created_at`: дата создания карточки (ISO 8601).
  - `updated_at`: дата последнего изменения (ISO 8601).
  - `net_worth`: текущий чистый капитал клиента (на основе активов).

## 3. Редактирование клиента
Эндпоинт: `PUT /api/client/:id`
- **Метод:** PUT
- **Тело запроса:** Аналогично `/first-run` (объект с полями `client`, `assets`, `liabilities`, `expenses`, `goals`).
- **Логика:** При вызове бэкенд полностью обновляет профиль и перезаписывает связанные сущности (активы, цели).
- **Пример:** Если нужно изменить только телефон, отправьте объект `client` с новым телефоном. Если изменился состав активов — пришлите новый массив `assets`.

## 4. Карта клиента (Get)
Эндпоинт: `GET /api/client/:id`
- Теперь возвращает полную информацию, включая `created_at` и `updated_at`. Используйте их для отображения в футере карточки или в списке ("Изменен 2 часа назад").

---
**Важно:** Для всех защищенных запросов по-прежнему требуется заголовок `x-api-key`.

## 5. Семейная справка (`client.family_profile`)
Поле добавлено как справочное и **не влияет на расчеты** (`/calculate`, `/first-run`, `/my/plan/first-run`).

- **Где передавать:** внутри `client` в теле first-run/calculate/update.
- **Формат:** объект `family_profile` (опциональный).

```json
{
  "client": {
    "family_profile": {
      "marital_status": "married",
      "children": [
        { "first_name": "Анна", "birth_date": "2017-05-10" }
      ],
      "contacts": [
        {
          "name": "Елена Петрова",
          "relation": "spouse",
          "phone": "+7-900-000-00-00",
          "email": "elena@example.com"
        }
      ],
      "spouse": {
        "employment_status": "employed",
        "monthly_income": 120000
      },
      "family_obligations": ["mortgage_payments", "child_education"],
      "real_estate": [
        {
          "name": "Основная квартира",
          "estimated_value": 14500000,
          "status": "mortgage"
        }
      ],
      "confidentiality": {
        "allow_spouse_access": true,
        "allow_family_contact": false,
        "notes": ""
      }
    }
  }
}
```

Справочники для UI:
- `marital_status`: `single`, `married`, `divorced`, `widowed`, `civil_union`
- `spouse.employment_status`: `employed`, `self_employed`, `unemployed`, `retired`, `other`
- `real_estate.status`: `owned`, `mortgage`
- `family_obligations`:
  - `alimony` (алименты)
  - `elder_support` (поддержка родителей)
  - `child_education` (детское образование)
  - `medical_care` (регулярные медрасходы)
  - `rent` (аренда)
  - `mortgage_payments` (ипотечные платежи)
  - `other_loans` (прочие кредиты)
  - `other` (прочее)
