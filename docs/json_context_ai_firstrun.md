# JSON и контекст для ИИ после firstRun (конструктор)

Документ для согласования **что именно видит модель** и **как формулировать ответ**. Реализация: `src/services/constructorAiService.js` — `buildFirstRunAiTrailingPayload`, `buildConstructorGeneratorPromptParts`, `compactCalculationForPresentationPrompt`, `calculationService.simplify`.

---

## 1. Где в запросе лежит JSON

После успешного firstRun (`/firstrun`, `/firstRunAIB2C`, любой ключ с подстрокой `firstrun`):

- В **system** полный JSON расчёта **не** кладётся.
- После истории и текущей реплики пользователя — **второе `user`-сообщение**: префикс «расчёт выполнен, JSON — источник цифр» + **JSON от `buildFirstRunAiTrailingPayload`** (см. §2).

Иные команды с расчётом (например homeowners) могут класть JSON в **system** — не этот документ.

---

## 2. Структура JSON для ИИ после firstRun (актуально)

Корень объекта включает:

| Блок | Назначение |
|------|------------|
| `summary`, `goals`, `client_id`, `investment_expense_growth_annual_percent` | Как раньше в компакте расчёта (`compactCalculationForPresentationPrompt`). |
| **`client_for_ai`** | Имя, пол, возраст, доход и капитал **для озвучивания**. Берётся из **экстракции диалога** + nickname конструктора — в «сыром» ответе `calculateFirstRun` этих полей нет. |
| **`pension_field_glossary_ru`** | Пояснения полей **`summary`** цели «пенсия» (желаемый доход, разрыв, капитал, взносы, `status`, `target_months`, `initial_capital_ops`, ИПК в summary и т.д.). |
| **`pension_state_pension_glossary_ru`** | Пояснения **модели страховой пенсии**: ИПК суммарный/текущий/прогноз, стоимость балла сегодня/к пенсии, фиксированная выплата, год/возраст выхода, текстовая **`formula_hint`** (как связать цифры без выдумывания законодательства). |
| **`pension_narrative_hints_ru`** | Отсылка к структуре презентации. |
| **`pension_presentation_structure_ru`** | **Порядок для пенсии:** «Достойная пенсия» → желаемый доход, госпенсия, доп. разрыв — везде **в сегодняшних ценах** (не формулировать «без учёта инфляции») → `pension_gap_future` как номинал к году пенсии → капитал и взносы. |
| **`goal_type_id_labels_ru`** | Справочник `goal_type_id` → краткое название типа цели (для всех firstRun с целями). |
| **`plan_tax_and_state_benefits_glossary_ru`** | **Обязательно:** расшифровка `summary.tax_benefits_summary` и `summary.total_state_benefit` (ПДС vs НСЖ, вычеты, софинансирование, блок `totals`). |
| **`goal_summary_tax_glossary_ru`** | **Обязательно:** смысл `goals[].summary.total_tax_benefit` и `total_cofinancing` по цели. |
| **`plan_tax_narrative_hints_ru`** | Как говорить про налоги пользователю (модель, не консультация; отсылка к PDF при нулевом `deduction_2026`). |
| **`passive_income_*`** | Если есть цель с `goal_type_id === 2`: `passive_income_field_glossary_ru`, `passive_income_narrative_hints_ru`. |
| **`investment_*`** | Если есть цель `=== 3`: `investment_field_glossary_ru`, `investment_narrative_hints_ru`. |
| **`other_goal_*`** | Если есть цель `4`, `6` или `9`: глоссарий прочей крупной цели + hints. |
| **`life_insurance_*`** | Если есть цель `=== 5`: поля summary, `life_insurance_details_glossary_ru` (программа, премия, вычеты, риски), hints. |
| **`fin_reserve_*`** | Если есть цель `=== 7`: подушка — глоссарий + hints. |
| **`rent_*`** | Если есть цель `=== 8`: рентный сценарий — глоссарий + hints. |

Элементы **`goals`** дополняются (по типу):

- всегда при наличии в расчёте: **`goal_type`**, **`portfolio_snapshot_for_ai`** (`portfolio_id`, `portfolio_name`);
- **пенсия**: `retirement_timeline`, `state_pension_details_for_ai`;
- **НСЖ (`goal_type_id` 5)**: **`life_details_for_ai`** — программа, премии, вычеты, **`risks_for_ai`** (до 12 рисков с лимитами);
- **аренда (`8`)**: при наличии — **`rent_instruments_short_for_ai`** (укороченный список инструментов портфеля).

Служебное поле **`summary._debug`** у пассивного дохода в промпт **не** попадает (вырезается).

---

## 3. Пример: цель «Пенсия» (фрагмент)

```json
{
  "client_for_ai": {
    "display_name": "Саша",
    "sex": "male",
    "birth_date": "1990-05-15",
    "age_years_estimated": 35,
    "avg_monthly_income": 150000,
    "total_liquid_capital": 50000,
    "note": "…"
  },
  "goals": [
    {
      "goal_name": "ГосПенсия",
      "goal_type_id": 1,
      "goal_type": "PENSION",
      "goal_id": 1103,
      "retirement_timeline": {
        "retirement_year": 2051,
        "years_to_pension": 25,
        "retirement_age": 65
      },
      "state_pension_details_for_ai": {
        "ipk_total": 138.49,
        "ipk_current": 47.85,
        "ipk_forecast": 90.63,
        "point_cost_today": 156.76,
        "point_cost_future": 612.12,
        "fixed_payment_today": 9584,
        "fixed_payment_future": 37423.53
      },
      "summary": {
        "target_amount_initial": 100000,
        "state_pension_monthly_today": 31293.6,
        "pension_gap_future": 268284.23,
        "projected_capital_at_retirement": 26828422.59,
        "initial_capital": 50000,
        "monthly_replenishment": 4927.57
      }
    }
  ],
  "pension_field_glossary_ru": { "…": "поля summary цели" },
  "pension_state_pension_glossary_ru": { "ipk_total": "…", "formula_hint": "…" },
  "pension_narrative_hints_ru": ["…"]
}
```

Полный ответ калькулятора с инструментами и годовой разбивкой см. в PDF; в промпт ИИ — `summary` цели + компакт госмодели + два глоссария, чтобы модель не путала ИПК, балл и фикс.

---

## 4. Сценарий презентации для цели PENSION (эталон формулировок)

Использовать **только** поля из JSON; не путать:

- **`target_amount_initial`** — желаемая **пенсия в месяц** в «сегодняшних» рублях.
- **`initial_capital`** — уже внесённый **стартовый капитал** по программе (не желаемая пенсия).

Логика текста (от лица ассистента, подставляя `client_for_ai.display_name` или «вы»):

1. Клиент хочет получать **`target_amount_initial` ₽ в месяц** (в ценах сегодня). Год выхода на пенсию — **`retirement_timeline.retirement_year`**.
2. В расчёте учтена **государственная пенсия**; в «сегодняшних» деньгах — **`state_pension_monthly_today` ₽/мес**. При желании коротко пояснить логику: ИПК и параметры балла/фикса — из **`state_pension_details_for_ai`** + расшифровка в **`pension_state_pension_glossary_ru`** (не подменять расчёт СФР). Подробности — **в PDF**.
3. Дополнительно обеспечить в «сегодняшних» деньгах порядка **`target_amount_initial − state_pension_monthly_today` ₽/мес** (если оба числа есть и разница положительна).
4. С учётом инфляции к выходу на пенсию нехватка в **номинале** месяца — **`pension_gap_future` ₽**.
5. По модели к накоплению к выходу — **`projected_capital_at_retirement` ₽** при стартовом **`initial_capital` ₽** и рекомендуемом пополнении **`monthly_replenishment` ₽/мес** со следующего периода (доходность, софинансирование и налоговые эффекты уже заложены в расчёт).

---

## 5. Зачем отдельный «метод» под ИИ

Ответ `calculateFirstRun` заточен под API/отчёт, **без** полей клиента для маленького чата. Экстракция (`extractFinancialPlanParams`) уже знает пол, дату рождения, доход — но жила отдельно от JSON в промпте.

**`buildFirstRunAiTrailingPayload`** склеивает: компакт расчёта + **`client_for_ai`** + глоссарии/подсказки **по всем типам целей, которые есть в плане** (пенсия, пассив, инвестиции, прочее, НСЖ, подушка, аренда). При раздувании файла константы можно вынести в `constructorFirstRunAiContextService.js`.

---

## 6. Полный контекст генератора (порядок)

1. **System** — инструкции firstRun; мозги бота; сценарий; ник/`user_context` из `constructor_clients`; напоминание про `client_for_ai`, пенсионные и прочие `*_glossary_ru` / `*_narrative_hints_ru`.
2. **История** — последние N ходов `constructor_logs` (`CONSTRUCTOR_GENERATOR_HISTORY_LOGS`, по умолчанию 10 записей).
3. **User** — текущее сообщение.
4. **User** — JSON из §2.

---

## 7. Что добавить дальше (идеи)

- **Верхний `summary` плана**: отдельный глоссарий для **`consolidated_portfolio`** (аллокации, доли) — налоги уже покрыты `plan_tax_*`.
- **Инструменты** по всем типам: единый короткий блок «доли, доходность, ПДС» без дублирования `monthly_schedule` в промпт.
- **Отдельный модуль** кода для глоссариев, если `constructorAiService.js` станет неудобно читать.

---

## 8. Если JSON снова станет жирным

1. Урезать **`goals[].summary`** whitelist-ом по типу цели.
2. Урезать верхний **`summary`** плана для чата.
3. Глоссарий можно вынести в статический system один раз (если модель стабильно его запомнит в рамках сессии) — обсуждаемо.

---

## 9. Черновик доп. правил для сценария в админке

- Источник цифр — только JSON во втором user-сообщении.
- Не обещать «сейчас посчитаю», если JSON уже есть.
- Налоги: **`plan_tax_and_state_benefits_glossary_ru`**, **`goal_summary_tax_glossary_ru`**, **`plan_tax_narrative_hints_ru`** + цифры из **`summary.tax_benefits_summary`**. В том же ответе сразу; формулировки «по модели расчёта»; при **одной цели** не дублировать те же суммы и по плану, и по цели; в конце — коротко про PDF при необходимости деталей.

---

*При изменении калькуляторов или `_generateTaxBenefitsSummary` — обновлять `PLAN_TAX_AND_STATE_BENEFITS_GLOSSARY_RU`, `GOAL_SUMMARY_TAX_GLOSSARY_RU`, `PLAN_TAX_NARRATIVE_HINTS_RU` в `constructorAiService.js` и этот файл.*
