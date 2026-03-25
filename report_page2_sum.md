# Страница 2 отчета: "Сводная информация"

Краткое техописание текущей реализации второй страницы PDF/HTML отчета PFP.

## Где код

- Основной рендер: `src/reports/summary/buildSummaryOverviewHtml.js`
- Локальная пересборка превью: `scripts/render_summary_preview_default.mjs`
- Готовый локальный HTML: `src/reports/summary/preview-default.html`

## Что есть на странице

1. Блок AI-интро.
2. Блок "Информация о клиенте".
3. Блок "Финансовая защита" (карточки `FIN_RESERVE` и `LIFE`, если есть).
4. Блок "Основные цели" (сейчас до 3 карточек на странице).
5. Ниже — 2 диаграммы распределения:
   - "Распределение начального капитала по целям"
   - "Распределение ежемесячных пополнений по целям"

## Данные для рендера

В `buildReportSummaryOverviewHtml(options)`:

- `reportPayload` (цели и summary)
- `clientInfo` (`name`, `age`, `income`, `currentCapital`)
- `aiIntroHtml` (опционально, если не передан — строится дефолтный текст)

## Параметры стилей (актуально)

- `summaryBackgroundUrl` — URL/путь фона страницы
- `summaryBackgroundDarknessPercent` — затемнение фона `0..100`
  - `0` = без затемнения
  - `100` = максимально темно
- `summaryTextColor` — основной цвет текста (`#RRGGBB`)
- `summaryLineColor` — цвет линий/бордеров секций (`#RRGGBB`)
- `summaryChartColor` — цвет акцента и диаграмм (`#RRGGBB`)

Совместимость:
- старый `summaryBackgroundOverlayOpacity` (`0..1`) поддерживается, но предпочтителен `summaryBackgroundDarknessPercent`.

## Картинки: как резолвятся

### В локальном превью

- Можно рендерить через локальные файлы (`inlineLocalAssets: true`, тогда ассеты вшиваются как `data:`).
- Можно рендерить через прямые ссылки Cloudflare/R2:
  - `SUMMARY_BG_URL`
  - `SUMMARY_LOGO_URL`

### В проде (через настройки агента)

Хранимые поля для страницы 2 в `pdf-settings`:

- `summary_background_url`
- `summary_logo_url`
- `summary_chart_color`

`GET /api/pfp/pdf-settings/summary-preview-html` возвращает HTML с учетом этих настроек.

## Спец-правило карточки "Сохранить и преумножить"

Для цели типа `INVESTMENT` в основной карточке:

- вместо `Стоимость` показывается `Капитал`
- значение берется из `initial_capital` (для мок-превью есть fallback)

## Локальная проверка

1. Пересобрать HTML:
   - `node scripts/render_summary_preview_default.mjs`
2. Открыть локально:
   - `http://localhost:8765/`

Если нужен фон/лого с Cloudflare:

- PowerShell:
  - `$env:SUMMARY_BG_URL="https://..."`
  - `$env:SUMMARY_LOGO_URL="https://..."`
  - `node scripts/render_summary_preview_default.mjs`
