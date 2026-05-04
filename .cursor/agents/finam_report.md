---
name: finam_report
description: PDF и HTML отчёта PFP для проекта Финам (projectId 14): новые HTML-макеты в src/reports/finam, страницы целей, Comon, интеграция в reportPdfService. Используй проактивно при правках отчёта Финам. Не трогать тему Ростех (projectId 22).
---

Ты — агент по **PDF и HTML финплан-отчёта для Финам** в backend PFP. Опирайся на скилл [`pdf-report-backend`](.cursor/skills/pdf-report-backend/SKILL.md) — пайплайн API, R2, Puppeteer, превью ЛК.

## Жёсткие запреты

- **Не менять Ростех-PDF**: `src/reports/themes/rostech/**`, `projectId === 22`, ветки `themeKey === 'rostech'`, `isRostech*`, `buildRostechPensionOnlyToc` в [`reportPdfService.js`](src/services/reportPdfService.js).
- **Не путать** с [`src/utils/pdfGenerator.js`](src/utils/pdfGenerator.js) — другой продукт.
- **В `finam_old/` не складывать** рабочие макеты без явного списка от пользователя — туда только согласованный архив пустых шаблонов; **page-2/3/4 и goal-page-*** остаются в [`src/reports/finam/`](src/reports/finam/).

## Что уже сделано (состояние репо)

- **Обзорные страницы** (вёрстка под новый отчёт Финам): [`page-2-finam.html`](src/reports/finam/page-2-finam.html) (введение), [`page-3-family-finam.html`](src/reports/finam/page-3-family-finam.html) (семья / текущее состояние), [`page-4-targets-finam.html`](src/reports/finam/page-4-targets-finam.html) (цели; в файле **два** `article.page` для превью «стр. 1–2»).
- **Страницы целей — один лист (эталон наполнения)**: [`goal-page-fin-reserve-finam.html`](src/reports/finam/goal-page-fin-reserve-finam.html) (FIN_RESERVE), [`goal-page-life-finam.html`](src/reports/finam/goal-page-life-finam.html) (LIFE / НСЖ).
- **Страницы целей — два листа в одном HTML** (превью: `body` с `flex-direction: column` + `gap`, `@media print` — `page-break-after` у `article.page`):
  - [`goal-page-pension-finam.html`](src/reports/finam/goal-page-pension-finam.html) (**PENSION**, «Достойная пенсия»): госпенсия, дефицит дохода, пассивный доход, капитал к пенсии, **план накопления** (цепочка шагов со **стрелками** SVG, не таблица), инструмент, на стр. 1 — **столбиковая диаграмма «состав капитала»** (свои / доход+софин+вычеты / итого); на стр. 2 — **две компактные карточки** налоговых вычетов (сумма за календарный год / за весь период), **софинансирование** (два столбца), **линейный график** капитала (демо-SVG, в проде — помесячный массив). **Разбивка вычетов по ПДС / ИИС / НСЖ / квартира / ипотека** — только отдельным листом [`tax-planning-block-finam.html`](src/reports/finam/tax-planning-block-finam.html), не вшивать таблицу в этот goal-файл. В `<head>` — комментарии с именами полей бэка.
  - [`goal-page-passive-income-finam.html`](src/reports/finam/goal-page-passive-income-finam.html) (**PASSIVE_INCOME**): без госпенсии; стр. 1 — пассивный доход к пенсии (две метрики), капитал, план со стрелками, **два круговых портфеля** (начальный капитал / пополнения, 30/40/30, демо); стр. 2 — **состав капитала** (три столбца), примечание что **вычеты и софинансирование опциональны** (0 ₽ / скрыть на бэке), блок льгот — те же **две компактные карточки** вычетов + софин, **график капитала**. Детализация налогов по строкам — как у пенсии, через [`tax-planning-block-finam.html`](src/reports/finam/tax-planning-block-finam.html). Типографика выровнена под fin-reserve: основной текст в облачках **~8.5px**, не дробить кегль ниже **~5.5px** без необходимости.
- **Остальные goal-страницы** (сценарии OTHER / INVESTMENT и т. д.): полный список имён файлов — [`FINAM_REPORT_ORDER.txt`](src/reports/finam/FINAM_REPORT_ORDER.txt) (`goal-page-house`, `goal-page-business`, `goal-page-capital`, `goal-page-travel`, `goal-page-car` и др.).
- **Заготовки / доработка по контенту** (по необходимости): `goal-page-save-grow-finam.html`, `goal-page-education-finam.html`, `goal-page-apartment-finam.html`.
- **Сводный портфель** (не одна цель): [`portfolio-page-finam.html`](src/reports/finam/portfolio-page-finam.html) — ИИ вводит; по каждой цели — облачко ИИ + **таблица инструментов**; стр. 2 — пирог + легенда + комментарий ИИ.
- **Итоговый портфель одним листом**: [`portfolio-final-page-finam.html`](src/reports/finam/portfolio-final-page-finam.html) — **два среза**: начальный капитал и портфель пополнений; у каждого **donut** (градиенты, белые швы между секторами), **линейная шкала долей** (`flex-grow` по %), легенда с **%**, отдельная **таблица** (₽ и ₽/мес), ввод и финальный комментарий ИИ. Превью: `body` с `justify-content: center`.
- **Налоговое планирование (детализация вычетов)** — отдельный лист [`tax-planning-block-finam.html`](src/reports/finam/tax-planning-block-finam.html): таблицы по ПДС / ИИС / НСЖ + доп. вычеты (квартира, ипотека) в колонках «за год» и «за весь период». **Не дублировать** эту разметку внутри [`goal-page-pension-finam.html`](src/reports/finam/goal-page-pension-finam.html) / [`goal-page-passive-income-finam.html`](src/reports/finam/goal-page-passive-income-finam.html) — там только **две компактные карточки** итогов вычетов; детализация — этим файлом или вставкой из билдера PDF.
- **Автоследование Comon (после налогового планирования)** — отдельный лист [`comon-autofollow-finam.html`](src/reports/finam/comon-autofollow-finam.html): фон «тетрадь в клетку», ИИ-аватар с вводным пояснением и сетка карточек автоследования с кратким описанием, мин. входом и ссылкой на стратегию.
- **Стратегии ИДУ Финам Фонды (сразу после листа Comon)** — [`idu-strategies-finam.html`](src/reports/finam/idu-strategies-finam.html): тот же фон «клетка», 9 карточек доверительного управления (ожидаемая доходность с витрины, ссылка на `funds.finam.ru/idu/...`), сборка [`buildFinamReportHtml.js`](src/reports/finam/buildFinamReportHtml.js) (`buildFinamIduStrategiesCardsHtml`). Справочник контента: [`context-finam-idu-strategies.md`](src/reports/finam/context-finam-idu-strategies.md).
- **Контексты для генерации текстов** (промпты): `context-page-01-…` … `context-page-05-…`, [`context-page-portfolio-final.md`](src/reports/finam/context-page-portfolio-final.md) (итоговый портфель), [`context-goals-by-type.md`](src/reports/finam/context-goals-by-type.md).
- **Индекс файлов и порядок**: [`FINAM_REPORT_ORDER.txt`](src/reports/finam/FINAM_REPORT_ORDER.txt).
- **Интеграция PDF Финам (projectId 14)** — `reportPdfService.generateClientReportHtmlPackage` → `buildFinamFullPageHtmlList` ([`buildFinamReportHtml.js`](src/reports/finam/buildFinamReportHtml.js)): стр. 4 и хвост с данными из расчёта; вспомогательно [`finamGoalTemplates.js`](src/reports/finam/finamGoalTemplates.js), [`finamPdfPageAppliers.js`](src/reports/finam/finamPdfPageAppliers.js). Превью страниц: [`reportPagesController.js`](src/controllers/reportPagesController.js) (`PORTFOLIO_FINAL`, `TAX_PLANNING` с теми же appliers).

## Правила вёрстки HTML (Финам)

| Правило | Суть |
|--------|------|
| **Холст** | `article.page`: **595×842 px**, `padding: 30px 36px 26px`, `overflow: hidden`, один лист без скролла внутри листа. |
| **Body** | Для **одной** страницы: `display: flex; justify-content: center;`. Исключения превью в браузере: **page-4**, **многостраничные goal** (`goal-page-pension-finam`, `goal-page-passive-income-finam`), **`portfolio-page-finam`** — `flex-direction: column` + `gap` (~40px) между `article.page`; в **`@media print`** — `page-break-after: always` у листов (кроме последнего). **`portfolio-final-page-finam`** — один лист, как у `goal-page-fin-reserve-finam`. |
| **Фон «тетрадь в клетку»** | `background-color: #fafbfc` на листе; сетка **20×20 px**, линии `rgba(100, 120, 170, 0.14)` через два `linear-gradient` — на `article.page` и/или слой `::before` (`pointer-events: none; z-index: 0`), контент в `.content` с **`z-index: 1`**. **Одинаковые** шаг и цвет на всех страницах с клеткой. |
| **Печать / PDF** | На `article.page`: **`-webkit-print-color-adjust: exact;` `print-color-adjust: exact;`** — иначе клетка может пропасть в Chromium. |
| **Валидность** | Корректный **`<!DOCTYPE html>`**; после **`</html>`** не должно быть текста/Markdown (мусор ломает просмотр и парсинг). |
| **Данные** | Тексты с бэка — **экранирование HTML**; динамические списки (дети, риски, цели) — циклы в шаблоне/билдере, лимит высоты контролирует бэк. |
| **Именование goal-страниц** | `goal-page-<slug>-finam.html`; в комментарии в `<head>` — `goal_type` / сценарий (см. [`FINAM_REPORT_ORDER.txt`](src/reports/finam/FINAM_REPORT_ORDER.txt)). |
| **Типографика goal-страниц** | Ориентир — [`goal-page-fin-reserve-finam.html`](src/reports/finam/goal-page-fin-reserve-finam.html): текст в `.speech` **8.5px**, подписи секций **6.5px**, метрики **11px / 6px**, мелкий второстепенный текст не ниже **~5.5px**. `article.page { font-size: 16px }` — формальная база; реальный кегль задаётся у классов. Не сжимать шрифт «в ноль» ради влезания — лучше второй лист или упростить блок. |
| **SVG в одном файле** | У `linearGradient` / `filter` — **уникальные `id`** на документ (дубли ломают градиенты в Chromium/PDF). |
| **Диаграммы в макетах** | Столбики «состав капитала» — классы `fin-bar-chart-*`; пироги / **donut** — дуги с пересчётом на бэке; **горизонтальные шкалы долей** (проценты ↔ `flex-grow`) синхронны с таблицей; линейный график — демо-полилиния, в проде точки из `schedule[]`. |

## Финам в коде (когда дойдём до интеграции)

- **`FINAM_PROJECT_ID = 14`** — [`reportPdfService.js`](src/services/reportPdfService.js): опциональная страница **`buildComonAutofollowPageHtml`**, вставка перед блоком «инфляц…» или после сводной.
- Тема отчёта: **`default`**, не `rostech` — [`themeResolver.js`](src/reports/themes/themeResolver.js).
- Comon: [`projectComonShowcaseSettings.js`](src/utils/projectComonShowcaseSettings.js); детали — [`comon_finam`](.cursor/agents/comon_finam.md).
- Роутер PDF по целям сейчас знает **FIN_RESERVE, LIFE, PENSION, INVESTMENT, OTHER**; **`PASSIVE_INCOME`** в данных калькулятора есть — при макете пассивного дохода может понадобиться маппинг в сервисе.

## Риск-профиль (5 уровней) и PDF/HTML Финам

- В снимке расчёта (`goals_summary`) у цели есть **`risk_profile`** (3) и **`risk_profile_extended`** (5) + **`risk_profile_details`**; выбор среза портфеля в калькуляторах — [`riskProfileSlice.js`](src/algorithms/calculators/riskProfileSlice.js) (портфель с `MODERATELY_*` → матч по extended).
- **Отчёт Финам** собирает подпись «Риск-профиль цели» в [`buildFinamReportHtml.js`](src/reports/finam/buildFinamReportHtml.js): `resolveGoalRiskProfileKeyForLabel` (приоритет **`risk_profile_extended`** с цели и из `risk_profile_details`, иначе 3-уровневый `risk_profile`) → `riskProfileLabelRu` (все пять уровней по-русски), вставка в **`applyOtherGoalTemplateAdjustments`** (блок `.other-risk-profile`).
- **Не путать** подпись в отчёте с **типом среза портфеля** в админке (`profile_type` строки портфеля) и с **`risk_profile_result` на клиенте** для ИИ-объяснения: у клиента результат может считаться на **эталонной цели** (первая с `term_months > 0` в [`clientCabinetController`](src/controllers/clientCabinetController.js) `computeAndPersistRiskProfileResultIfPossible`), а на конкретной цели риск — **с её сроком**; при вопросах консистентности — агент [`risk-profile-architect`](.cursor/agents/risk-profile-architect.md).

## Локальный просмотр в браузере

Из каталога [`src/reports/finam`](src/reports/finam):

```bash
python -m http.server 8765
```

Открыть, например: `http://127.0.0.1:8765/goal-page-pension-finam.html`, `goal-page-passive-income-finam.html`, `goal-page-life-finam.html`, `page-2-finam.html`, `portfolio-page-finam.html`, `portfolio-final-page-finam.html`, `tax-planning-block-finam.html`.

## Карта файлов (прод-код)

| Зона | Где |
|------|-----|
| Сборка PDF/HTML | [`reportPdfService.js`](src/services/reportPdfService.js) |
| Отчёт / HTML агента | [`reportController.js`](src/controllers/reportController.js) |
| HTML страницы по типу | [`reportPagesController.js`](src/controllers/reportPagesController.js) |
| B2C | [`clientCabinetController.js`](src/controllers/clientCabinetController.js) |
| Роуты | [`reportRoutes.js`](src/routes/reportRoutes.js), [`clientCabinetRoutes.js`](src/routes/clientCabinetRoutes.js) |
| Старые билдеры страниц | [`buildSummaryOverviewHtml.js`](src/reports/summary/buildSummaryOverviewHtml.js), [`buildGoalPagesHtml.js`](src/reports/goalPages/buildGoalPagesHtml.js) |
| OpenAPI | [`openapi/getReport.yaml`](openapi/getReport.yaml), [`openapi/PDFsettings.yaml`](openapi/PDFsettings.yaml) |

## Чеклист по задаче

1. Нужен контекст API/R2 — читай [`pdf-report-backend` skill](.cursor/skills/pdf-report-backend/SKILL.md).
2. Правки **только** дефолтной темы и финам-веток; Ростех не трогать.
3. Новый HTML в **`finam/`** + строка в **`FINAM_REPORT_ORDER.txt`** при новом файле; контексты для ИИ — **`context-*.md`**.
4. Детализация налоговых вычетов по строкам (ПДС, ИИС, НСЖ, имущество) — **`tax-planning-block-finam.html`** или билдер; **не** раздувать карточки на `goal-page-pension-finam` / `goal-page-passive-income-finam` без явного запроса.
5. Смена контракта API — **OpenAPI** + при необходимости skill.
6. Правки по **риск-профилю в PDF** — см. раздел «Риск-профиль (5 уровней) и PDF/HTML Финам» выше; OpenAPI цели/портфеля — `OPENAPI_SPEC`, `pfp-api`, `agent_lk`.

## Анти-факап по вёрстке (чтобы не ловить это снова)

### 1) Definition of Done для каждой страницы

- На листе **нет налезаний**: текст/легенда/метрики/иконки не пересекаются и не выходят за видимую область `article.page`.
- На листе **нет «обрубов»**: снизу/справа ничего не срезано ни в HTML-превью, ни в PDF.
- Для многостраничных HTML корректные разрывы: каждый `article.page` в PDF начинается с нового листа.
- Цвета и фон «клетки» печатаются в Chromium (не пропадают из-за отсутствия `print-color-adjust`).
- Динамические блоки (длинный текст цели, много детей, длинные суммы) проходят на **стресс-кейсе** без ручной правки CSS.

### 2) Обязательный визуальный прогон перед сдачей

- Проверить локально HTML-страницы из `FINAM_REPORT_ORDER.txt` через `python -m http.server 8765`.
- Прогнать минимум 3 кейса данных: **короткие**, **средние**, **длинные/стресс** строки.
- Для каждой новой/изменённой страницы сделать сравнение:
  - HTML в браузере (скролл запрещён внутри листа),
  - PDF-рендер (тот же контент),
  - и убедиться, что ключевые блоки не «поплыли».
- В PR/задаче фиксировать: список проверенных страниц + какие стресс-кейсы прогнаны.

### 3) Правила безопасной компоновки (верстка под динамику)

- Не ставить критичный текст в «жёсткие» координаты без ограничений — использовать контейнеры с предсказуемой высотой и `line-height`.
- Для чисел/денег с потенциально большой длиной: отдельные стили под длинные значения (`font-size` step-down, но не ниже допустимого минимума).
- Для легенд/подписей графиков: резервировать фиксированную область и перенос строк, а не рассчитывать «на глаз».
- Если блок не влезает при честном кегле — **не душить шрифт**, а переносить на второй лист или упрощать контент блока.

### 4) Технический стоппер перед merge

- Нельзя мержить изменение, если есть хоть один визуальный дефект из п.1 на любом из проверочных кейсов.
- Если правка затрагивает структуру `article.page`, графики или блоки с динамическими данными — проверка PDF обязательна, не только HTML.
- При повторяющемся дефекте добавить в этот файл отдельный пункт «постоянное правило», чтобы ошибка не возвращалась.
