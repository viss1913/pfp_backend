# ТЗ для фронтенд-разработки: Управление клиентами (v2)

Бэкенд обновлен для поддержки полноценного жизненного цикла клиента. Ниже описаны изменения в API и логике интеграции.

## 1. Идентификация (UUID)
При создании или обновлении клиента фронтенд может передавать свой уникальный ID.
- **Поле:** `client.uuid` (строка, например UUID v4).
- **Зачем:** Позволяет фронту знать ID объекта еще до того, как он попадет в БД, что удобно для оффлайн-работы или кэширования.
- **Опционально:** Если не передавать, бэкенд будет использовать только свой внутренний `id`.

## 2. Список клиентов (Dashboard)

**Один человек в разных банках/проектах** — это **несколько карточек `clients`** (разный `project_id`). Внутри одного проекта у клиента один владелец `agent_id`.

Эндпоинт: `GET /api/client/agent-clients`
- **Поиск:** Добавьте строку поиска. При вводе отправляйте запрос с параметром `?search=текст`. Поиск идет по ФИО, телефону, Email и UUID.
- **Пагинация:** По умолчанию лимит снят (приходит весь список). Но эндпоинт готов к `limit` и `page`, если клиентов станет слишком много.
- **Новые поля в объекте:**
  - `external_uuid`: ваш переданный ID.
  - `created_at`: дата создания карточки (ISO 8601).
  - `updated_at`: дата последнего изменения (ISO 8601).
  - `net_worth`: текущий чистый капитал клиента (на основе активов).

## 3. Редактирование клиента
**ЛК агента (рекомендуется):** `PUT /api/pfp/clients/:id` — JWT агента, контракт в `docs/api/agent_lk.yaml`.

**Интеграции / legacy:** `PUT /api/client/:id` — тот же handler и тело.

- **Метод:** PUT
- **Тело запроса:** Частичный объект: `client`, `assets`, `liabilities`, `credits`, `expenses`, `goals` — **только переданные top-level блоки** меняются (merge внутри `client`, замена массивов для assets/credits и т.д.).
- **Пересчёт плана:** по умолчанию нет; `?recalculate=true` — пересчитать после сохранения.
- **Пример:** только телефон — `{ "client": { "phone": "+7..." } }`. Кредиты — `{ "credits": […] }` или `liabilities`.

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
      "family_obligations": [
        { "type": "mortgage", "amount_monthly": 85000 },
        { "type": "education", "amount_monthly": 25000 }
      ],
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
- `family_obligations[]`: `{ type, amount_monthly }`
- `family_obligations.type`:
  - `loans` (кредиты)
  - `mortgage` (ипотека)
  - `rent` (аренда недвижимости)
  - `alimony` (алименты)
  - `education` (обучение детей)
  - `elder_support` (поддержка родителей)
  - `other` (прочее)
