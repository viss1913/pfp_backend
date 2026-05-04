# Rollout: риск-профиль v1 (Финам)

## Цель

Переход на backend-driven риск-профиль:

- анкета приходит из API;
- ответы и расчет хранятся на backend;
- фронт не содержит хардкода вопросов/баллов.

## Этапы

### Этап 1. Подготовка backend

- миграции таблиц `risk_questionnaire_versions`, `risk_questions`, `risk_answer_options`, `risk_scoring_rules`;
- новые endpoint'ы:
  - `GET /my/risk-profile/questionnaire`
  - `GET /my/risk-profile/answers`
  - `POST /my/risk-profile/answers`
- расчет профиля в `riskProfileService` по методике BaseScore + BehaviorScore.

**Синхрон расчёт / ЛК (2026):** в `calculateFirstRun` обязательства нормализуются так же, как при сохранении клиента (`mergeLiabilitiesWithCredits`). Эталонная цель для `risk_profile_result` и снимок для ИИ (`goals_portfolio_risk`) используют тот же порядок целей, что и расчёт (`sortGoalsForCalculationOrder`).

### Этап 2. Shadow-режим

- фронт продолжает старую отправку, но параллельно использует новый endpoint анкеты;
- backend считает новый профиль и сохраняет `risk_profile_result`;
- мониторим расхождения между legacy и новым профилем в логах.

### Этап 3. Включение нового флоу

- фронт полностью рендерит анкету из `GET /my/risk-profile/questionnaire`;
- отправляет ответы только в формате `question_code -> option_code`;
- `risk_profile` в целях заполняется только backend.

### Этап 4. Удаление legacy

- убрать фронтовый хардкод текстов/баллов;
- удалить legacy-поддержку старых ключей после стабилизации.

## Критерии готовности

- нет хардкода анкеты на фронте;
- есть версия анкеты в данных клиента;
- в `risk_profile_result` есть explain-output для валидации и поддержки.
