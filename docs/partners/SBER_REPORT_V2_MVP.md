# Отчёт SBER (projectId 29) — Finam Report v2, MVP витрины

White-label PDF/HTML на движке Finam v2: структура целей и портфеля как у Finam, в хвосте — витрины партнёра Сбера вместо Comon / ДУ Finam / «Финам Бонус».

## Константы

| Параметр | Значение |
|----------|----------|
| `projectId` | **29** (`SBER`) |
| Публичный ключ | `pk_8ef9004b1d87aab34c8476e5` |
| Версия отчёта | `system_settings.report_finam = 2` (см. миграцию `20260619120000_sber_project_29_onboarding.js`) |

## Порядок листов (хвост PDF)

Для **29** (`SBER_V2_TAIL_PAGE_ORDER` в `finamV2SberPageConfig.js`):

1. Итоговый портфель  
2. Налоговое планирование  
3. **Акции — витрина Сбер** (`page-sber-equities-v2.html`)  
4. **Облигации — витрина Сбер** (`page-sber-bonds-v2.html`)  
5. Дорожная карта  
6. Макроконтур  
7. Декларация о рисках  
8. Подробный план  

**Не попадают в PDF для 29:** Comon, ДУ Finam (`IDU_STRATEGIES`), спецпредложения Finam (`FINAM_OFFERS`).

Для **Finam 14** и остальных template-проектов хвост без изменений (`FINAM_V2_TAIL_PAGE_ORDER`).

## Витрина продуктов (MVP)

Данные: `finamV2SberProductCatalog.js` (статический каталог; фаза 2 — `projects.settings` или API).

На каждом листе (**акции** / **облигации**):

| Секция | Карточки | Базовый URL |
|--------|----------|-------------|
| УК «Первая» | Продукт 1, Продукт 2 (placeholder) | `https://first-am.ru/fund` |
| Сбер Инвестиции | Продукт 1, Продукт 2 (placeholder) | `https://www.sberbank.ru/ru/person/investments` |

В карточке: название, короткий текст, chip «Ожид. доходность: —», ссылка «Подробнее».

Рендер: `finamV2SberBranding.js` → `replaceSberEquitiesPage` / `replaceSberBondsPage` в `finamV2TemplateAppliers.js`.

## Страхование жизни (LIFE)

- Отдельного листа нет — **как у Finam v2:** `page-goal-life-v2.html` при цели LIFE в портфеле.
- Расчёт для **14 и 29:** актуарный порт `Podushka final.py` (возраст/пол/срок, подписка k_12); срок по умолчанию **5 лет** (Finam 14), **6 лет** (Immers 2), **15 лет** (Сбер 29 / АТБ 28) — `sberPodushkaActuarial`, `lifeTermDefaults`.
- Продукт в UI/PDF: **«Страхование по подписке · Сбер Страхование Жизни»** (АТБ 28: «· СК Лучи»).
- Бренд **Сбер** (не «СК Лучи» — это только АТБ 28).

## Реферальные ссылки

После сборки HTML/PDF: `reportPdfService` → `applyPartnerLinkTrackingToPages`.

В `projects.settings` (миграция 29): `partner_link_tracking` с whitelist `npfsberbanka.ru`, `sberbank-insurance.ru`, `first-am.ru`, `sberbank.ru`, `agent_id_param: agent_id`.

Ссылка LIFE («Страхование по подписке») в `page-roadmap-v2.html` получает UTM/`agent_id` на post-process, если домен в whitelist и у агента заполнен `partner_agent_id`.

## Ключевые файлы

| Роль | Путь |
|------|------|
| Хвост для 29 | `src/reports/finam_v2/finamV2SberPageConfig.js` |
| Каталог карточек | `src/reports/finam_v2/finamV2SberProductCatalog.js` |
| Appliers / HTML витрин | `src/reports/finam_v2/finamV2SberBranding.js` |
| Шаблоны | `page-sber-equities-v2.html`, `page-sber-bonds-v2.html` |
| Composer | `finamV2PageComposer.js` → `resolveTailPageOrder` |
| Агент Cursor | `.cursor/agents/sber-report.md` |

## Smoke-чеклист

1. Агент на project **29** с заполненным `partner_agent_id`.
2. Клиент с целями и портфелем (в т.ч. LIFE — по желанию).
3. Сгенерировать PDF (`GET /api/pfp/reports/:clientId/pdf`).
4. Проверить:
   - нет листов Comon / ДУ Finam / Финам Бонус;
   - есть листы «Акции» и «Облигации» с 4 карточками на каждом;
   - href на `first-am.ru` / `sberbank.ru` содержат `agent_id` (если ID задан);
   - LIFE-лист с премией из калькулятора (не LLM).

Локальный скрипт: `node tmp/smoke-sber-report-v2.js`.

## Фаза 2 (вне MVP)

- Лист **НПФ** (`npfsberbanka.ru`).
- Реальные названия фондов и доходности из settings/API.
- Зелёная палитра Сбера (`applySberReportBranding` + CSS vars).
- Условный показ витрин только при ненулевой доле акций/облигаций в портфеле.
