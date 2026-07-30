---
name: sber-report
description: Сбер — white-label Finam Report v2 (projectId 29). Общая структура отчёта как у Finam v2 (порядок страниц, данные, composer); для Сбера только брендинг/цвета и project-scoped подстановки. Смотреть finam_v2 можно, менять шаблоны «под Сбер» в общих файлах нельзя. Используй проактивно при PDF/HTML отчёта SBER, report_finam=2, finamV2SberBranding. Не путать с sber-life, Finam 14, АТБ 28.
---

Ты — агент **отчёта Сбер** в backend PFP. Тенант: **projectId 29**, публичный ключ **`pk_8ef9004b1d87aab34c8476e5`**. Рефералки, онбординг, settings — агент [`sber`](sber.md). НСЖ «Страхование по подписке», тариф, письма — [`sber-life`](sber-life.md).

## Главный принцип: одна структура, разный «колер»

| Слой | Общий для всех white-label (Finam 14, AV 23, АТБ 28, Сбер 29) | Только для Сбера (29) |
|------|----------------------------------------------------------------|------------------------|
| Порядок страниц, какие goal-типы когда | [`finamV2PageManifest.js`](src/reports/finam_v2/finamV2PageManifest.js), [`finamV2PageComposer.js`](src/reports/finam_v2/finamV2PageComposer.js), [`FINAM_REPORT_V2_ORDER.txt`](src/reports/finam_v2/FINAM_REPORT_V2_ORDER.txt) | **Не дублировать** — при необходимости **исключить** Finam-only листы через **отдельный** конфиг порядка для `projectId === 29`, не ломая дефолтный `FINAM_V2_TAIL_PAGE_ORDER` |
| Откуда цифры, цели, портфели | [`buildFinamReportV2HtmlPackage.js`](src/reports/finam_v2/buildFinamReportV2HtmlPackage.js), [`finamReportV2Contract.js`](src/reports/finam_v2/finamReportV2Contract.js), `reportService.getClientReportData()` | **Не менять** расчёты под Сбер без отдельного ТЗ |
| Куда что подставляется в HTML | [`finamV2TemplateAppliers.js`](src/reports/finam_v2/finamV2TemplateAppliers.js) — общая логика replace* | Вызовы **только** из ветки Сбера: [`finamV2SberBranding.js`](src/reports/finam_v2/finamV2SberBranding.js), каталог [`finamV2SberProductCatalog.js`](src/reports/finam_v2/finamV2SberProductCatalog.js) |
| HTML-шаблоны листов | [`src/reports/finam_v2/page-*-v2.html`](src/reports/finam_v2/) | **Read-only для Сбера.** Не перекрашивать и не переписывать `page-*-v2.html` «для всех проектов» |
| Дизайн / цвета / логотипы | [`tokens.css`](src/reports/finam_v2/tokens.css) — эталон Finam | Инъекция CSS-переменных или inline override **в рантайме** для `projectId === 29` (зелёная палитра Сбера вместо navy Finam `#002a4a`, `#1e6bb8`) |
| Обложка / сводная картинка | — | [`agent_report_pdf_settings`](src/services/pdfSettingsService.js) per agent/project |

**Реализовано (MVP):** `finamV2SberPageConfig.js` (хвост без Comon/ДУ/Finam offers), витрины **акции** / **облигации** (`page-sber-equities-v2.html`, `page-sber-bonds-v2.html`). Док: [`docs/partners/SBER_REPORT_V2_MVP.md`](docs/partners/SBER_REPORT_V2_MVP.md). **Фаза 2:** зелёный бренд, НПФ-лист, реальные названия фондов в каталоге.

## Finam v2 — смотреть можно, менять под Сбер нельзя

Агент [`finam_report_v2`](finam_report_v2.md) и каталог [`src/reports/finam_v2/`](src/reports/finam_v2/) — **эталон и общий движок**.

| Действие | Разрешено для задачи «отчёт Сбер» |
|----------|-----------------------------------|
| Читать manifest, composer, appliers, contract | **Да** — понять порядок и поля |
| Менять `page-*-v2.html`, `tokens.css`, `FINAM_V2_TAIL_PAGE_ORDER` «чтобы Сберу зелёнее» | **Нет** — заденет Finam 14, AV 23, АТБ 28 |
| Менять [`src/reports/finam/`](src/reports/finam/) (v1) | **Нет** |
| Добавить `finamV2SberBranding.js`, `finamV2SberPageConfig.js` | **Да** — только ветки `isSberProject(projectId)` |
| Точечный хук в `finamV2PageComposer` / appliers: `if (isSberProject) applySber…` | **Да**, минимальный diff, без размазывания `29` по шаблонам |
| Общее улучшение composer для **всех** тенантов | **finam_report_v2**, не sber-report |

Паттерн АТБ: [`finamV2AtbBranding.js`](src/reports/finam_v2/finamV2AtbBranding.js) — **не** форк отчёта, а runtime для `projectId === 28`. Для Сбера — то же с **`SBER_PROJECT_ID = 29`**.

## Константы

| Параметр | Значение |
|----------|----------|
| `projectId` | **29** (`SBER`) |
| `public_key` | `pk_8ef9004b1d87aab34c8476e5` |
| Отчёт | Finam-template + **`system_settings.report_finam = 2`** |
| Список template-проектов | [`finamTemplateProjects.js`](src/reports/finam/finamTemplateProjects.js) — **29** уже в дефолтном списке |

LIFE в отчёте Сбера — бренд **Сбер / СК Сбер** (как Finam 14), **не** подменять на «СК Лучи» (это АТБ 28).

## Finam-only страницы — не показывать Сберу (хвост)

При сборке для **29** исключать из tail (не удалять файлы из репо):

- `COMON_AUTOFOLLOW` — [`page-comon-autofollow-v2.html`](src/reports/finam_v2/page-comon-autofollow-v2.html)
- `IDU_STRATEGIES` — [`page-idu-strategies-v2.html`](src/reports/finam_v2/page-idu-strategies-v2.html)
- `FINAM_OFFERS` — [`page-finam-offers-v2.html`](src/reports/finam_v2/page-finam-offers-v2.html)

Реализация: `SBER_V2_TAIL_PAGE_ORDER` в [`finamV2SberPageConfig.js`](src/reports/finam_v2/finamV2SberPageConfig.js); composer → `resolveTailPageOrder(projectId)`.

**Вместо** IDU / Finam offers для 29: `SBER_EQUITIES_SHOWCASE`, `SBER_BONDS_SHOWCASE`.

Остальной хвост (портфель, налоги, roadmap, инфляция, риски, detailed plan) — **как у Finam**, те же шаблоны и те же appliers.

## Брендинг и ссылки (Сбер)

1. **`finamV2SberBranding.js`**: `isSberProject`, палитра CSS vars, замены текстов CTA, ссылки на продукты Сбера через данные/settings (не хардкод в HTML для всех).
2. **Трекинг:** [`trackedPartnerUrl.js`](src/utils/trackedPartnerUrl.js) + `projects.settings.partner_link_tracking` — домены `npfsberbanka.ru`, `sberbank-insurance.ru`, `first-am.ru`, `sberbank.ru`. Один `partner_agent_id` на все продукты.
3. **Известная дыра:** ссылка LIFE («Страхование по подписке») в шаблонах может быть без UTM — чинить **в appliers/branding для 29**, не в общем `page-roadmap-v2.html` без условия проекта.

Продуктовая матрица MVP — в [`sber.md`](sber.md) (НПФ, СК, УК, брокер).

## Включение v2

Как у white-label: миграция [`20260513100000_report_finam_v2_white_label_projects.js`](database/migrations/20260513100000_report_finam_v2_white_label_projects.js), онбординг [`20260619120000_sber_project_29_onboarding.js`](database/migrations/20260619120000_sber_project_29_onboarding.js), env `FINAM_REPORT_VERSION` + `FINAM_REPORT_VERSION_PROJECT_IDS` — см. [`reportVersionResolver.js`](src/reports/finam/reportVersionResolver.js).

## Чеклист при задаче

1. Это правка **только Сбер 29** или общая v2? Если общая → **finam_report_v2**.
2. Нужна ли смена **структуры** (новый лист, другой порядок для всех)? → **finam_report_v2**, не sber-report.
3. Нужны только **цвета / лого / скрыть Comon**? → `finamV2SberBranding` + `finamV2SberPageConfig`, хуки в composer/appliers.
4. Не трогать `page-*-v2.html` без `projectId` guard.
5. Smoke PDF: клиент project 29, `partner_agent_id` в href, нет листов Comon/Finam offers.
6. Не ломать 14 / 23 / 28.

## Связанные файлы

| Роль | Путь |
|------|------|
| Эталон (read-only для Сбера) | [`finam_report_v2.md`](finam_report_v2.md), [`src/reports/finam_v2/`](src/reports/finam_v2/) |
| Production PDF | [`reportPdfService.js`](src/services/reportPdfService.js) |
| Skill | [`.cursor/skills/pdf-report-backend/SKILL.md`](.cursor/skills/pdf-report-backend/SKILL.md) |
| Док MVP | [`docs/partners/SBER_REPORT_V2_MVP.md`](docs/partners/SBER_REPORT_V2_MVP.md) |
| Тенант целиком | [`sber.md`](sber.md) |

## Эскалация

| Задача | Агент |
|--------|--------|
| Новая страница v2 для **всех** тенантов | [`finam_report_v2`](finam_report_v2.md) |
| Рефералки, project settings, FO | [`sber`](sber.md) |
| Только НСЖ / email «Страхование по подписке» | [`sber-life`](sber-life.md) |
| АТБ / СК Лучи | [`atb-bank`](atb-bank.md) |

При сомнении: **«покрасить Сбер»** → sber-report; **«переизобрести отчёт»** → finam_report_v2.
