# Context primer: итоговый контекст firstRun → LLM (Gemini через OpenRouter)

Как **настраивать** и **в каком порядке** подаём текст в модель после серверного `calculateFirstRun`. Код: `constructorAiService.js` — `buildConstructorGeneratorPromptParts`, `generateResponse` / `generateResponseStream`, `buildFirstRunLayeredMessagesForSmoke` (смоук).

См. также: [json_context_ai_firstrun.md](./json_context_ai_firstrun.md) — состав JSON во втором user-сообщении.

---

## 1. Порядок сообщений (как в чате API)


| #   | Роль                     | Содержимое                                                                                                                                                                                                                                                                                                |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **system**               | Слои, склеенные через `\n\n`: критические инструкции firstRun с расчётом; имя бота; `base_brain_context`; блоки **Brain** (`constructor_brain_contexts`); `communication_style`; текст сценария команды (`command.response`); строка «Клиент: никнейм / user_context». JSON расчёта сюда **не** кладётся. |
| 2…  | **user** / **assistant** | История из `constructor_logs` (последние N пар), роль чередуется. Размер: `CONSTRUCTOR_GENERATOR_HISTORY_LOGS` (дефолт 10 записей логов).                                                                                                                                                                 |
| k   | **user**                 | Текущая реплика пользователя (например ответ «30 тыс»).                                                                                                                                                                                                                                                   |
| k+1 | **user**                 | **Служебный хвост:** фиксированный префикст + строка `Результат расчёта (JSON):` + **полный JSON** из `buildFirstRunAiTrailingPayload` (расчёт + `client_for_ai` + глоссарии по типам целей + налоги + пенсия и т.д.).                                                                                    |


Префикс хвоста (дословно в коде):

```text
Служебное сообщение (не показывать пользователю как цитату): расчёт УЖЕ выполнен. Ниже JSON — единственный источник цифр для ответа.

Результат расчёта (JSON):
```

---

## 2. Итоговый блок «как это выглядит» (схема)

Ниже — **логическая** сборка без реальных длинных текстов админки.

### System (одна строка роли, тело — конкатенация секций)

```text
КРИТИЧЕСКИ ВАЖНО ДЛЯ ЭТОГО ОТВЕТА:
Финансовый план УЖЕ рассчитан на сервере. Сразу после истории диалога тебе будет отдельное пользовательское сообщение с JSON результата.
… (инструкции про client_for_ai, глоссарии, налоги, типы целей) …
ЗАПРЕЩЕНО: «я сейчас рассчитаю» …

Имя ассистента (настройки бота): …

Базовый контекст бота:
…

Контексты из админки:
--- Заголовок мозга ---
…

Стиль общения:
…

Сценарий (/firstrun):
…

Клиент:
Никнейм: …
Контекст: …
```

### История (пример)

```text
user: Привет
assistant: …
user: …
assistant: …
```

### Текущий user

```text
50000 на старте, хочу 100 тысяч на пенсию
```

### Второй user (JSON)

Один объект с полями вроде: `summary`, `goals`, `client_id`, `client_for_ai`, `goal_type_id_labels_ru`, `plan_tax_and_state_benefits_glossary_ru`, `goal_summary_tax_glossary_ru`, `plan_tax_narrative_hints_ru`, при пенсии — `pension_*`, в `goals[]` — обогащения (`retirement_timeline`, `state_pension_details_for_ai`, …). Подробно — [json_context_ai_firstrun.md](./json_context_ai_firstrun.md).

---

## 3. Настройка «главного контекста»


| Рычаг                         | Где задаётся                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Обязательные правила firstRun | Код `buildConstructorGeneratorPromptParts` (менять осторожно).                                                                                                                                     |
| Личность и тон                | `constructor_bots`: `name`, `base_brain_context`, `communication_style`.                                                                                                                           |
| Продуктовые вставки           | `constructor_brain_contexts` по `project_id`.                                                                                                                                                      |
| Сценарий шага                 | `constructor_commands.response` для ключа firstRun.                                                                                                                                                |
| Имя в чате                    | `constructor_clients.nickname`, `user_context`.                                                                                                                                                    |
| Объём истории                 | Env `CONSTRUCTOR_GENERATOR_HISTORY_LOGS`.                                                                                                                                                          |
| Содержание цифр               | Только JSON-хвост; править через расчёт и `buildFirstRunAiTrailingPayload`.                                                                                                                        |
| Налоги в речи                 | В system зашито: вычеты и софинансирование из `summary.tax_benefits_summary` — **в том же ответе сразу**, не опциональным хвостом «рассказать?».                                                   |
| Пенсия                        | В JSON есть `**pension_presentation_structure_ru`**: сначала доходы и разрыв (в т.ч. инфляция → `pension_gap_future`), потом смысл капитала и взносы; заголовок «Основная цель: Достойная пенсия». |


---

## 4. Смоук-тест через Gemini (OpenRouter)

1. В `.env`: `OPENROUTER_API_KEY`, опционально `OPENROUTER_MODEL=google/gemma-3-27b-it` или другая модель на OpenRouter.
2. Запуск из корня репозитория:

```bash
node scripts/context_primer_gemini_smoke.js
```

Скрипт подставляет **фикстуру** расчёта (`scripts/fixtures/context_primer_sample_firstrun_result.json`) и экстракцию (`context_primer_sample_extraction.json`), собирает те же сообщения, что генератор, и вызывает `aiService.getCompletion`. Без ключа выводит только сводку по длинам сообщений.

Переопределение модели: `CONTEXT_PRIMER_MODEL=google/gemini-2.5-flash`.

---

## 5. Что не кладём в system нарочно

- Полный JSON расчёта firstRun (чтобы модель не игнорировала цифры) — только во **втором user** после реплики пользователя.
- `yearly_breakdown` в целях в промпте убирает `simplify`; глоссарий налогов предупреждает про нулевой `deduction_2026`.

