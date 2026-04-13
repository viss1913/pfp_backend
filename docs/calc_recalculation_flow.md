# `/calc`: пересчёт после `firstRunAIB2C`

Документ фиксирует переключение в `/calc`, контракт JSON-экстракции и параметры пересчёта по типам целей.

## 1. Переключение в `/calc`

Переходим в режим пересчёта только если одновременно:

1. В текущем ходе классификатор выбрал команду `/calc`.
2. У `constructor_clients` есть `pfp_client_id`.
3. В PFP-клиенте есть хотя бы одна цель.
4. Есть снимок `goals_summary` (или допускается пересчёт без заморозки с предупреждением в лог).

Если хотя бы одно условие не выполнено, возвращаем пользователю пояснение:
- без `pfp_client_id`: сначала сделать `firstRunAIB2C`;
- нет целей/плана: сначала сформировать стартовый план;
- неоднозначный запрос: просим уточнить цель.

## 2. JSON-контракт экстракции для `/calc`

LLM должна вернуть **только JSON** следующей структуры:

```json
{
  "target_goal": {
    "id": 123,
    "goal_type_id": 1,
    "name": "Пенсия"
  },
  "goal_patch": {
    "target_amount": 120000,
    "term_months": 180,
    "monthly_replenishment": 25000,
    "risk_profile": "BALANCED"
  },
  "client_patch": {
    "avg_monthly_income": 220000,
    "total_liquid_capital": 1500000
  },
  "needs_clarification": false,
  "clarification_question": ""
}
```

Правила:
- `target_goal.id` приоритетный; если его нет, бэкенд пробует резолв по `goal_type_id + name`.
- `goal_patch` содержит только изменённые поля.
- `client_patch` опционален.
- `needs_clarification=true` блокирует пересчёт; пользователю задаётся `clarification_question`.

## 3. Матрица параметров пересчёта по целям

Источник: `docs/RECALCULATE_ALGORITHMS.md`, `src/algorithms/recalculators/index.js`.

| goal_type_id | Тип цели | Что можно патчить в `/calc` | Основной ожидаемый выход |
|---|---|---|---|
| 1 | PENSION | `target_amount`, `desired_monthly_income`, `term_months`, `initial_capital`, `ops_capital`, `ipk_current`, `inflation_rate`, `risk_profile` | новый дефицит/профицит и рекомендуемое пополнение |
| 2 | PASSIVE_INCOME | `target_amount`, `desired_monthly_income`, `term_months`, `initial_capital`, `monthly_replenishment`, `inflation_rate`, `risk_profile` | достижимый доход/нужное пополнение |
| 3 | INVESTMENT | `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment`, `inflation_rate`, `risk_profile` | капитал на горизонте, gap/surplus |
| 4 | OTHER | `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment`, `inflation_rate`, `risk_profile`, `name` | требуемое пополнение/достижимость |
| 5 | LIFE | `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment`, `inflation_rate` | покрытие/стоимость и денежный план |
| 6 | PDS | как у pension recalculator | показатели ПДС с учётом срока/взносов |
| 7 | FIN_RESERVE | `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment` | скорость достижения резерва |
| 8 | RENT | `target_amount`, `term_months`, `initial_capital`, `monthly_replenishment`, `risk_profile` | доходность/распределение по инструментам |
| 9 | OTHER | как у type 4 | достижимость цели |
| 10 | HOME_OWNERS (placeholder) | отдельная ветка `/homeownerscalc` | страховой расчёт, не через recalculate |

## 4. Runtime-пайплайн `/calc`

1. Прочитать текущего PFP-клиента по `pfp_client_id`.
2. Подготовить prompt с текущими целями и последним диалогом.
3. Извлечь `recalc patch` через OpenRouter.
4. Провалидировать JSON (`needs_clarification`, наличие цели и patch).
5. Подготовить цель: `goalRecalculator.prepare(existing, goal_patch)`.
6. Вызвать `calculationService.calculateFirstRun(calcRequest, targetGoalId, previousCalculation, { isFirstRun: false, usePool: false })`.
7. Сохранить:
   - `updateGoal` для пересчитанной цели;
   - `syncCalculationGoalsWithDatabase`;
   - `goals_summary`.
8. Сформировать AI-контекст для ответа пользователю (краткий JSON из результата).
9. Сгенерировать текст ответа и добавить ссылку на PDF.

## 5. Чеклист внедрения и тестов

- [ ] `/calc` не запускается без `pfp_client_id`.
- [ ] Пересчёт одной цели проходит по `id`.
- [ ] Резолв цели по `goal_type_id + name` работает.
- [ ] При `needs_clarification=true` пересчёт не стартует.
- [ ] После пересчёта обновляются `goals_summary` и goal в БД.
- [ ] Ответ ИИ использует только цифры из результата расчёта.
- [ ] Пользователь получает рабочую PDF-ссылку.
