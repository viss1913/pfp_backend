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

## Структура, которую фронт должен читать из `GET /api/pfp/pdf-settings`

Фронт ЛК должен ориентироваться на `editor_schema.templates` (не хардкодить 2 шаблона).

### Какие шаблоны приходят
- `report_cover`
- `report_summary_overview`
- `report_fin_reserve`
- `report_life`
- `report_investment`
- `report_other`

### Как фронту рендерить UI
Для каждого элемента из `editor_schema.templates[]`:
1) взять `id`, `title`, `description`
2) пройти по `fields[]`
3) отрисовать контрол по `type` (`image`, `text`, `color`, `readonly`)
4) при сохранении отправлять `PATCH /api/pfp/pdf-settings` по `field.patch_key`

### Какие ключи сейчас реально изменяемые
`cover_*`:
- `cover_background_url`
- `cover_title`
- `title_band_color`

Примечание: для `cover_*` отдельного параметра прозрачности/затемнения фона сейчас нет.

`summary_*` (shared для `report_summary_overview` + `report_fin_reserve` + `report_life` + `report_investment` + `report_other`):
- `summary_background_url`
- `summary_chart_color`
- `summary_background_darkness_percent`
- `summary_text_color`
- `summary_line_color`

Пояснение по смыслу полей:
- `summary_background_url` — фоновая картинка страницы.
- `summary_chart_color` — цвет акцента (заголовки секций, графические акценты).
- `summary_background_darkness_percent` — затемнение фона в процентах (`0..100`).
- `summary_text_color` — основной цвет текста на странице.
- `summary_line_color` — цвет линий и бордеров блоков.

Важно: для `FIN_RESERVE/LIFE/INVESTMENT/OTHER` сейчас отдельные шаблоны в `templates[]` есть, но `patch_key` у них пока shared (`summary_*`). Это ожидаемое поведение текущей версии API.

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
4) `summary_background_darkness_percent` — степень затемнения фона (0..100)
5) `summary_text_color` — цвет текста
6) `summary_line_color` — цвет линий/бордеров

С помощью этих полей бэк возвращает HTML в `summary-preview-html`.

## Статусы “новых параметров” (важно для фронта)
Новые параметры затемнения/цвета текста заведены в контракт и идут через `pdf-settings` (см. `editor_schema` и OpenAPI): они применяются и для превью, и для генерации PDF.

Фронту нужно считать эти поля “валидными настройками” и **передавать/рендерить** их, если они есть в ответе `GET /api/pfp/pdf-settings` или если агент их менял через `PATCH /api/pfp/pdf-settings`.

## Быстрый чек-лист для команды фронта
1) Для превью: используйте `GET /api/pfp/pdf-settings/summary-preview-html` и `iframe.srcdoc`.
2) Для карточек целей (если фронт рисует сам): берите `goal_card_assets.cards[].public_url` по `goal_type`.
3) Для фона/лого/стиля: поддерживаются поля `summary_background_url`, `summary_background_darkness_percent`, `summary_logo_url`, `summary_chart_color`, `summary_text_color`, `summary_line_color`.

## Применение к страницам целей (FIN_RESERVE/LIFE/INVESTMENT/OTHER)
Для отдельных HTML-шаблонов страниц целей (печать/PDF на фронте) сейчас используются те же поля `pdf-settings`:
1) `summary_background_url` — фон страницы.
2) `summary_logo_url` — логотип.
3) `summary_chart_color` — цвет акцента/графиков.

Поэтому в шаблонах страниц целей (FIN_RESERVE/LIFE/INVESTMENT/OTHER) и в сводной управляются:
- `summary_background_url` + затемнение (`summary_background_darkness_percent`)
- цвет текста (`summary_text_color`)
- цвет линий/бордеров (`summary_line_color`)

## Шаблоны страниц: как вызывать и что можно настроить
Ниже прям “по пальцам”: какое имя страницы, какой endpoint, что вернётся и какие поля UI должен передать из `pdf-settings`.

Важно: endpoint’ы получения HTML для `FIN_RESERVE/LIFE/INVESTMENT/OTHER/SUMMARY` сами подтягивают текущие настройки `pdf-settings` (по агенту из токена). Фронту не надо руками прокидывать эти параметры в запрос с `clientId` — они уже в бэке.

### Сводка портфеля (страница с распределениями по целям)
Название (pageType): `SUMMARY`
Как вызвать (HTML для печати/PDF на фронте):
`GET /api/pfp/reports/:clientId/pages/SUMMARY/html?inline=1`

Что приходит:
- `text/html` — готовая HTML-страница A4 (её можно показывать в `iframe`/`srcdoc` или печатать на фронте)

Что можно настраивать через `pdf-settings`:
- `summary_background_url` — фон
- `summary_background_darkness_percent` — затемнение фона
- `summary_logo_url` — логотип
- `summary_chart_color` — акцент/цвет графиков
- `summary_text_color` — цвет текста
- `summary_line_color` — цвет линий/бордеров

Что берётся автоматически (не настраивается в ЛК):
- картинки карточек целей под `goal_type` (через R2 seeds; в ЛК это `goal_card_assets`, но менять нельзя)

### Страница “Финансовый резерв”
Название (pageType): `FIN_RESERVE`
Как вызвать:
`GET /api/pfp/reports/:clientId/pages/FIN_RESERVE/html?inline=1`

Что приходит:
- `text/html` — HTML-страница A4

Что можно настраивать через `pdf-settings`:
- `summary_background_url`
- `summary_background_darkness_percent`
- `summary_logo_url`
- `summary_chart_color`
- `summary_text_color`
- `summary_line_color`

### Страница “Защита жизни”
Название (pageType): `LIFE`
Как вызвать:
`GET /api/pfp/reports/:clientId/pages/LIFE/html?inline=1`

Что приходит:
- `text/html` — HTML-страница A4

Что можно настраивать через `pdf-settings`:
- `summary_background_url`
- `summary_background_darkness_percent`
- `summary_logo_url`
- `summary_chart_color`
- `summary_text_color`
- `summary_line_color`

### Страница “Сохранить и приумножить” (инвестиции)
Название (pageType): `INVESTMENT`
Как вызвать:
`GET /api/pfp/reports/:clientId/pages/INVESTMENT/html?inline=1`

Что приходит:
- `text/html` — HTML-страница A4

Что можно настраивать через `pdf-settings`:
- `summary_background_url`
- `summary_background_darkness_percent`
- `summary_logo_url`
- `summary_chart_color`
- `summary_text_color`
- `summary_line_color`

### Страница “Квартира” (прочая цель, дом/квартира)
Название (pageType): `OTHER`
Как вызвать:
`GET /api/pfp/reports/:clientId/pages/OTHER/html?inline=1`

Что приходит:
- `text/html` — HTML-страница A4

Что можно настраивать через `pdf-settings`:
- `summary_background_url`
- `summary_background_darkness_percent`
- `summary_logo_url`
- `summary_chart_color`
- `summary_text_color`
- `summary_line_color`

### Для превью в ЛК (без `clientId`)
Endpoint:
`GET /api/pfp/pdf-settings/summary-preview-html`

Что приходит:
- `text/html` — HTML-страница “Сводка” для `iframe`

Что настраивается:
- только по тем же полям `pdf-settings` (фон/логотип/акцент/затемнение/цвет текста/линий)
