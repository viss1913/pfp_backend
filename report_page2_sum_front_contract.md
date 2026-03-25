# Страница 2 отчёта: “Сводная информация” (frontend contract)

## Цель интеграции
Поддержать отображение второй страницы отчёта (PDF/HTML) с одинаковой вёрсткой и ассетами: фон, лого, цвет акцента/диаграмм и картинки карточек целей (PENSION/INVESTMENT/OTHER/FIN_RESERVE/LIFE).

## Вариант А (рекомендуется): рендерить HTML от бэка
Если фронту нужно просто показать превью “как в PDF”, то самый надёжный путь — получить готовый HTML от бэка и вставить в `iframe` через `srcdoc`.

### Endpoint
`GET /api/pfp/pdf-settings/summary-preview-html`

### Заголовки
- `Authorization: Bearer <JWT>`
- `x-project-key`: опционально (если ваш бэкенд/мидлвары ожидают)

### Что приходит
Ответ: `text/html` — **полная HTML-страница A4**.

### Как показать на фронте
1) сделать `fetch` с `Authorization`
2) прочитать body как текст
3) `iframe.srcdoc = htmlText`

Важно: `iframe src="..."` с `Authorization` не пройдёт стандартно, потому что браузер не даст проставить JWT в iframe напрямую. Поэтому `srcdoc` — норм.

## Вариант B: фронт сам рисует карточки и диаграммы (через assets)
Если фронт строит UI сам (не только “показать html от бэка”), то для картинок карточек целей используйте объект `goal_card_assets` из ответа `GET /api/pfp/pdf-settings`.

### Endpoint
`GET /api/pfp/pdf-settings`

### Что важно по assets
`goal_card_assets`:
- `cards[]` — массив карточек-ассетов
- каждая карточка:
  - `goal_type` (ключ, совпадает с типом цели в API)
  - `public_url` — прямая публичная ссылка на картинку (Cloudflare/R2 public base)
  - при необходимости: `r2_object_key`, `repo_relative_path`

### Сколько картинок целей
В `goal_card_assets.cards[]` лежит **набор всех типов карточек**, которые есть в репозитории/seed’ах. Сейчас на “Сводной” в данных обычно встречаются до 5 типов:
- `PENSION`
- `OTHER`
- `FIN_RESERVE`
- `LIFE`
- `INVESTMENT`

Фронт должен мапить картинки не по индексу, а по `goal_type`.

### Правило выбора картинки
Для каждой цели `goal.goal_type` найдите в `goal_card_assets.cards[]` элемент с тем же `goal_type`.
Берите `public_url` как `img src`.

Если `public_url == null`, то:
- у вас не настроен R2 public base / не выполнен seed
- для фронта картинка может быть недоступна по публичному URL

Рекомендуемое действие для устранения: выполнить seed `npm run seed:pdf-goal-cards-r2` (и убедиться, что R2 public base env задан).

## Какие настройки страницы реально управляются через pdf-settings сейчас
Текущее хранилище/редактирование через ЛК (`pdf-settings`) содержит **следующие поля** для страницы 2:
1) `summary_background_url` — фон страницы (картинка)
2) `summary_logo_url` — логотип (картинка)
3) `summary_chart_color` — цвет акцента секций/диаграмм

С помощью этих полей бэк возвращает HTML в `summary-preview-html`.

## Статусы “новых параметров” (важно для фронта)
Мы добавляли параметры затемнения/цвета текста в генератор HTML (`buildSummaryOverviewHtml.js`) для локального контроля, но **в текущем контракте pdf-settings для сохранения в БД/обмена с ЛК** эти поля пока **не заведены** (в `editor_schema` сейчас только background/logo/chart color).

Поэтому фронт сейчас НЕ должен ожидать, что ЛК агент может отправить:
- затемнение фона в формате `0..100`
- отдельный цвет текста
- отдельный цвет линий/бордеров

Если вы хотите сделать UI-слайдеры для этих параметров — нужно расширять:
1) таблицу/колонки в БД
2) `pdfSettingsController.patchMy` (Joi schema)
3) `pdfSettingsService.mergeWithDefaults` и `buildSummaryPreviewHtml`
4) `pdfSettingsService.getEditorSchema()` и `openapi/PDFsettings.yaml`

## Быстрый чек-лист для команды фронта
1) Для превью: используйте `GET /api/pfp/pdf-settings/summary-preview-html` и `iframe.srcdoc`.
2) Для карточек целей (если фронт рисует сам): берите `goal_card_assets.cards[].public_url` по `goal_type`.
3) Для фона/лого/акцента: сейчас поддерживаются поля `summary_background_url`, `summary_logo_url`, `summary_chart_color`.

