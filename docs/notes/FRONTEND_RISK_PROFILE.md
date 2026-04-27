# Интеграция риск-профиля (backend-driven)

Фронт больше не хардкодит тексты вопросов, варианты и баллы.  
Анкета риск-профиля полностью приходит с backend API.

## 1) Новый клиентский поток

1. Фронт запрашивает активную анкету:
   - `GET /api/my/risk-profile/questionnaire`
2. Рендерит вопросы/пояснения/варианты как пришли.
3. Сохраняет ответы:
   - `POST /api/my/risk-profile/answers`
4. Передает те же ответы в `first-run/recalculate` внутри `client.risk_profile_answers`.
5. Бэкенд рассчитывает риск-профиль по методике BaseScore + BehaviorScore.

## 2) Формат анкеты

В `GET /my/risk-profile/questionnaire` приходит:

- `questionnaire.id / code / name / description`
- `questions[]`:
  - `code`, `title`, `description`, `help_text`, `category`, `sort_order`
  - `options[]`: `code`, `label`, `score`, `sort_order`

Сохраняем и отправляем ответы в формате:

```json
{
  "risk_profile_answers": {
    "drawdown_reaction": "a3",
    "uncertainty_attitude": "a2",
    "investment_success_benchmark": "a3"
  },
  "risk_questionnaire_version_id": 1
}
```

Допустимо отправлять legacy-значения (числа), backend нормализует к `option_code`.

## 3) Интеграция с расчетом целей

В `POST /api/my/plan/first-run` и `POST /api/my/plan/{goalId}/recalculate`:

- `goals[i].risk_profile` остается опциональным.
- При наличии `client.risk_profile_answers` backend сам пересчитывает `risk_profile`.
- Дополнительно backend возвращает `risk_profile_details` (explain-output).

## 4) Что теперь не делаем на фронте

- Не держим локальный список вопросов/вариантов/баллов.
- Не считаем score на клиенте.
- Не интерпретируем профиль локальной логикой.
