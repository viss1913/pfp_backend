# План: умное распределение — LIFE (fallback НСЖ) и нулевые доли

## Ограничение (актуально)

**Внешнее API партнёра НСЖ сейчас не используется как истина** — в проде опираемся на **внутреннюю fallback-логику**, как в [`LifeInsuranceCalculator.js`](../../src/algorithms/calculators/LifeInsuranceCalculator.js) при ошибке `nsjApiService.calculateLifeInsurance` (`_fallback`, формулы от `target_amount` / `term_months` и `payment_variant`).

Любой общий хелпер «первый взнос LIFE» и резерв в `_calculateSmartAllocation` должен **повторять тот же контракт**: try NSJ → при ошибке тот же `nsjResult`, что в калькуляторе, затем расчёт `costNow` (single / annual / monthly).

Отдельно чинить `_calculateLifeInsuranceNeeded` под «живой» ответ API **не приоритет**; разумнее удалить или оставить заглушку до появления стабильного контракта.

---

## Проблема 1: LIFE и пул

- В [`_calculateSmartAllocation`](../../src/services/calculationService.js) для приоритета ≤2 у LIFE берётся `needed = goal.initial_capital || 0`, **без** fallback на `target_amount` (в отличие от FinReserve). Часто `needed = 0`.
- [`resolveInitialCapital`](../../src/algorithms/calculators/BaseCalculator.js) при `smart_initial_capital === 0` возвращает **0** и **не** вызывает `deductFromSharedPool`, хотя в LIFE уже посчитан `costNow`.

**Исправление:**

1. Вынести **`computeLifeUpfrontCost(goal, context)`** (или без `context`, только `goal` + опционально предрасчитанный nsj): внутри — **копия ветки из LifeInsuranceCalculator** (включая catch + fallback), на выходе число `costNow`.
2. В фазе priority ≤2 для `goal_type_id === 5`: `needed = await computeLifeUpfrontCost(...)`, дальше как сейчас `take = min(tempPool, needed)`, `_internalDeduct`.
3. Подстраховка в **LifeInsuranceCalculator**: если после смарт-аллокации `Number(goal.smart_initial_capital) <= 0` и `costNow > 0`, списать с пула через `deductFromSharedPool(costNow, context)` (не через ветку `resolveInitialCapital`, которая отдаёт 0).

---

## Проблема 2: нули по «прочим» целям

В том же файле, цикл по `burdenGoals`: **`Math.floor(allocation / 50000) * 50000`** обнуляет малые доли у всех, кроме последней.

**Исправление:** адаптивный шаг округления и/или минимальная ненулевая доля при `burden > 0` и достаточном `tempPool`, с сохранением суммы списаний = остаток (последняя цель забирает хвост).

---

## Файлы

- [`src/services/calculationService.js`](../../src/services/calculationService.js)
- [`src/algorithms/calculators/LifeInsuranceCalculator.js`](../../src/algorithms/calculators/LifeInsuranceCalculator.js)
- Новый небольшой модуль, например `src/algorithms/calculators/lifeUpfrontCost.js` (чтобы не плодить циклические импорты с `calculationService`)

---

## Проверка

- First run, **NSJ недоступен**: пул уменьшается на fallback-`costNow`, отчёт LIFE согласован.
- Несколько целей с малым весом — нет нулей при ненулевом пуле (в разумных пределах).
- FinReserve + инвестиции 60% + пересчёт одной цели — без двойного списания.

---

## Todos

1. `life-upfront-helper` — хелпер с **той же** логикой, что калькулятор, включая **fallback без API**.
2. `life-pool-reserve` — резерв в смарт-аллокации для LIFE + подстраховка в калькуляторе при `smart === 0`.
3. `fix-dead-nsj-helper` — удалить или заглушить `_calculateLifeInsuranceNeeded` (не тащить «живой» API как основу).
4. `min-allocation-burden` — убрать/смягчить округление до 50k, гарантировать минимальные доли.
